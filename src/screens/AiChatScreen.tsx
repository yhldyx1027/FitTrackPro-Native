// ============================================================
// FitTrack Pro - AI 饮食/训练助手 (DeepSeek Chat)
// ------------------------------------------------------------
// Chat with DeepSeek about food / macros / meals or training plans.
// API key is stored locally in AsyncStorage, never in the bundle.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
  Dimensions, PixelRatio,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import PressableScale from '../components/PressableScale';
import {
  AiSettings, AiContext, AiTrainingContext, ParsedFood, GeneratedTrainingPlan,
  chatWithDeepSeek, extractFoodFromReply, extractTrainingPlanFromReply,
  buildAiSystemPrompt, buildTrainingSystemPrompt, DEFAULT_AI_MODEL, AI_MODELS,
} from '../services/ai';
import { loadAiSettings, saveAiSettings } from '../storage/storage';
import { createId } from '../utils/calculations';
import { TrainingPlan } from '../types';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const DIET_QUICK_QUESTIONS = [
  '鸡胸肉每100克的营养？',
  '我吃了200克鸡胸肉和一碗米饭，帮我算热量',
  '帮我安排今天的一日三餐',
  '训练日碳水和蛋白质怎么配',
  '现在还能吃多少热量？',
];

const TRAINING_QUICK_QUESTIONS = [
  '帮我生成一个全身增肌训练计划',
  '我练上肢推A，帮我优化动作安排',
  '减脂期一周怎么安排训练',
  '给我一个新手入门计划',
  '今天休息日，适合做什么恢复？',
];

function newId() {
  return 'msg-' + Math.random().toString(36).slice(2, 10);
}

export default function AiChatScreen({ navigation }: any) {
  const app = useApp();
  const route = useRoute();
  const mode: 'diet' | 'training' = (route.params as any)?.mode ?? 'diet';
  const isTraining = mode === 'training';
  const quickQuestions = isTraining ? TRAINING_QUICK_QUESTIONS : DIET_QUICK_QUESTIONS;

  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<AiSettings | null>(null);

  // Setup form state
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [setupMsg, setSetupMsg] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kb, setKb] = useState(0);
  const [generatedFood, setGeneratedFood] = useState<ParsedFood | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedTrainingPlan | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Manual keyboard tracking. Some Android IMEs (e.g. WeChat input on vivo)
  // emit a spurious second event with a near-zero height that would otherwise
  // drop the input back behind the keyboard. The chat page is full-screen
  // (tab bar hidden) so lifting by the full keyboard height lands the bar
  // exactly flush with the keyboard top. The max() guards the spurious events.
  useEffect(() => {
    const screenH = Dimensions.get('window').height / PixelRatio.get();
    const s = Keyboard.addListener('keyboardDidShow', e => {
      const reported = e.endCoordinates.height || 0;
      const fromY = Math.max(0, screenH - (e.endCoordinates.screenY || screenH));
      setKb(prev => Math.max(prev, reported, fromY));
    });
    const h = Keyboard.addListener('keyboardDidHide', () => {
      setKb(0);
    });
    return () => { s.remove(); h.remove(); };
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadAiSettings();
      setSettings(s);
      if (s) {
        setApiKey(s.apiKey);
        setModel(s.model);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: isTraining ? 'AI 训练助手' : 'AI 饮食助手',
      headerRight: () =>
        messages.length > 0 ? (
          <PressableScale onPress={() => setMessages([])} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>清空</Text>
          </PressableScale>
        ) : null,
    });
  }, [navigation, messages.length, isTraining]);

  const showSetupMsg = (text: string) => {
    setSetupMsg(text);
    setTimeout(() => setSetupMsg(''), 2400);
  };

  const handleSaveSettings = async () => {
    const key = apiKey.trim();
    if (!key) {
      showSetupMsg('请先粘贴你的 DeepSeek API Key');
      return;
    }
    await saveAiSettings({ apiKey: key, model });
    setSettings({ apiKey: key, model });
    showSetupMsg('已保存，可以开始提问了');
  };

  // The chat page can be pushed from any tab stack. Only the Diet tab stack
  // has no "DietPage" route (its main screen is "DietMain"), so pick the right
  // target instead of letting NAVIGATE fail.
  const goAddFood = () => {
    const state = navigation.getState();
    const hasDietPage = state?.routes?.some((r: any) => r.name === 'DietPage');
    if (hasDietPage) {
      navigation.navigate('DietPage');
    } else {
      navigation.navigate('DietMain');
    }
  };

  const goAddPlan = () => {
    const state = navigation.getState();
    const hasTrainingPage = state?.routes?.some((r: any) => r.name === 'TrainingPage');
    if (hasTrainingPage) {
      navigation.navigate('TrainingPage');
    } else {
      navigation.navigate('TrainingMain');
    }
  };

  const buildSystemPrompt = (): string => {
    const recentTrainingLogs = app.historyTrainingLogs.slice(0, 14);
    const recentDietLogs = app.historyDietLogs.slice(0, 14);
    const weightHistory = app.weightHistory.slice(-10);

    if (isTraining) {
      const tctx: AiTrainingContext = {
        profile: app.profile,
        plans: app.plans,
        todayWorkout: app.todayWorkout,
        todayTrainingLog: app.todayTrainingLog,
        isTrainingDay: app.isTrainingDay,
        trainingCal: app.trainingCal,
        trainingVol: app.trainingVol,
        recentTrainingLogs,
        recentDietLogs,
        weightHistory,
      };
      return buildTrainingSystemPrompt(tctx);
    }
    const dctx: AiContext = {
      profile: app.profile,
      dietEntries: app.todayDietEntries,
      trainingLog: app.todayTrainingLog,
      isTrainingDay: app.isTrainingDay,
      trainingCal: app.trainingCal,
      recentTrainingLogs,
      recentDietLogs,
      weightHistory,
    };
    return buildAiSystemPrompt(dctx);
  };

  const send = async (raw?: string) => {
    const content = (raw ?? input).trim();
    if (!content || loading || !settings) return;

    const userMsg: ChatMsg = { id: newId(), role: 'user', text: content };
    const history = messages.map(m => ({ role: m.role, content: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setError('');
    setGeneratedFood(null);
    setGeneratedPlan(null);
    setLoading(true);

    try {
      const reply = await chatWithDeepSeek(
        settings.apiKey,
        settings.model,
        [...history, { role: 'user', content }],
        buildSystemPrompt()
      );
      // Hide the structured JSON markers (and the whitespace around them)
      // from the visible bubble text.
      const visibleText = reply.replace(/\s*__(FOOD|PLAN)_JSON__[\s\S]*?__END__\s*/g, '').trim();
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', text: visibleText || reply }]);

      if (isTraining) {
        const plan = extractTrainingPlanFromReply(reply);
        if (plan) {
          const newPlan: TrainingPlan = {
            id: createId('plan'),
            name: plan.name,
            notes: plan.notes,
            estimatedDurationMinutes: plan.estimatedDurationMinutes,
            exercises: plan.exercises.map(ex => ({
              id: createId('exercise'),
              name: ex.name,
              sets: ex.sets.map(s => ({ id: createId('plan-set'), reps: s.reps, weight: s.weight })),
              exerciseType: ex.exerciseType,
              met: null,
              bodyweightLoadFactor: 0.7,
            })),
          };
          await app.upsertPlan(newPlan);
          setGeneratedPlan(plan);
        }
      } else {
        const food = extractFoodFromReply(reply);
        if (food) {
          // Persist to the food library so it shows up in the Diet page with its own 添加 button.
          if (!app.foodDb.some(f => f.name === food.name)) {
            await app.replaceFoodDb([...app.foodDb, food]);
          }
          setGeneratedFood(food);
        }
      }
    } catch (e: any) {
      setError(e?.message || '请求失败，请重试');
      setInput(content);
    } finally {
      setLoading(false);
    }
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={Colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {!settings ? (
        // ---- Setup card (no API key configured yet) ----
        <ScrollView style={styles.screen} contentContainerStyle={styles.setupContent} keyboardShouldPersistTaps="handled">
          <View style={styles.setupCard}>
            <View style={styles.aiAvatar}>
              <Text style={styles.aiAvatarText}>AI</Text>
            </View>
            <Text style={styles.setupTitle}>{isTraining ? '配置 AI 训练助手' : '配置 AI 饮食助手'}</Text>
            <Text style={styles.setupSub}>
              {isTraining
                ? '填入你自己的 DeepSeek API Key，即可让 AI 帮你生成训练计划、优化动作安排、给出训练建议。Key 只保存在本机，不会上传。'
                : '填入你自己的 DeepSeek API Key，即可在手机里问食物热量、碳蛋脂和一日三餐的搭配。Key 只保存在本机，不会上传。'}
            </Text>

            <Text style={styles.formLabel}>DeepSeek API Key</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            <Text style={styles.formLabel}>模型</Text>
            <View style={styles.chipRow}>
              {AI_MODELS.map(m => (
                <PressableScale
                  key={m.value}
                  style={[styles.chip, model === m.value && styles.chipActive]}
                  onPress={() => setModel(m.value)}
                >
                  <Text style={[styles.chipText, model === m.value && styles.chipTextActive]}>{m.label}</Text>
                </PressableScale>
              ))}
            </View>

            {setupMsg !== '' && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{setupMsg}</Text>
              </View>
            )}

            <PressableScale style={styles.primaryBtn} onPress={handleSaveSettings}>
              <Text style={styles.primaryBtnText}>保存并开始使用</Text>
            </PressableScale>
            <Text style={styles.setupHint}>还没有 Key？前往 platform.deepseek.com 注册创建</Text>
          </View>
        </ScrollView>
      ) : (
        // ---- Chat ----
        <>
          {error !== '' && (
            <View style={styles.errorBar}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <ScrollView
            ref={scrollRef}
            style={styles.chatList}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.aiAvatar}>
                  <Text style={styles.aiAvatarText}>AI</Text>
                </View>
                <Text style={styles.emptyTitle}>{isTraining ? '今天练什么，问我就好' : '今天想吃什么，问我就好'}</Text>
                <Text style={styles.emptySub}>
                  {isTraining
                    ? '我能结合你的身体数据、目标和计划库，帮你生成训练计划、优化动作安排。'
                    : '我能结合你的身体数据、目标摄入和今日已吃，帮你算热量、配碳蛋脂、安排三餐。'}
                </Text>
                <View style={styles.quickWrap}>
                  {quickQuestions.map((q: string) => (
                    <PressableScale key={q} style={styles.quickChip} onPress={() => send(q)}>
                      <Text style={styles.quickChipText}>{q}</Text>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : (
              messages.map(m => (
                <View
                  key={m.id}
                  style={[styles.bubbleRow, m.role === 'user' ? styles.userRow : styles.aiRow]}
                >
                  {m.role === 'assistant' && (
                    <View style={[styles.aiAvatar, styles.aiAvatarSmall]}>
                      <Text style={[styles.aiAvatarText, styles.aiAvatarTextSmall]}>AI</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      m.role === 'user' ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        m.role === 'user' ? styles.userBubbleText : styles.aiBubbleText,
                      ]}
                    >
                      {m.text}
                    </Text>
                  </View>
                </View>
              ))
            )}

            {loading && (
              <View style={[styles.bubbleRow, styles.aiRow]}>
                <View style={[styles.aiAvatar, styles.aiAvatarSmall]}>
                  <Text style={[styles.aiAvatarText, styles.aiAvatarTextSmall]}>AI</Text>
                </View>
                <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
                  <ActivityIndicator size="small" color={Colors.accent} />
                  <Text style={styles.typingText}>正在思考…</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {generatedFood && !isTraining && (
            <View style={styles.foodGenCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodGenTitle}>已生成食物到食物库</Text>
                <Text style={styles.foodGenMeta}>
                  {generatedFood.name}｜{generatedFood.calories}千卡｜碳{generatedFood.carbs} 蛋{generatedFood.protein} 脂{generatedFood.fat}
                </Text>
              </View>
              <PressableScale style={styles.foodGenBtn} onPress={goAddFood}>
                <Text style={styles.foodGenBtnText}>去饮食页添加</Text>
              </PressableScale>
            </View>
          )}

          {generatedPlan && isTraining && (
            <View style={styles.foodGenCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodGenTitle}>已生成训练计划到计划库</Text>
                <Text style={styles.foodGenMeta}>
                  {generatedPlan.name}｜{generatedPlan.exercises.length}个动作｜约{generatedPlan.estimatedDurationMinutes ?? '?'}分钟
                </Text>
              </View>
              <PressableScale style={styles.foodGenBtn} onPress={goAddPlan}>
                <Text style={styles.foodGenBtnText}>去训练页查看</Text>
              </PressableScale>
            </View>
          )}

          <View style={[styles.inputBar, { marginBottom: kb, paddingBottom: Math.max(Spacing.md, insets.bottom) }]}>
            <TextInput
              style={styles.chatInput}
              value={input}
              onChangeText={setInput}
              placeholder={isTraining ? '问训练安排、动作优化，或让我直接生成计划…' : '问食物热量、碳蛋脂或三餐搭配…'}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
              onSubmitEditing={() => send()}
              blurOnSubmit={false}
            />
            <PressableScale
              style={[styles.sendBtn, (loading || input.trim() === '') && styles.sendBtnDisabled]}
              onPress={() => send()}
            >
              <Text style={styles.sendBtnText}>发送</Text>
            </PressableScale>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  // ---- Setup ----
  setupContent: { padding: Spacing.lg, paddingBottom: Spacing.section },
  setupCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl, padding: Spacing.xxl,
    ...Shadow.card, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'center',
    marginTop: Spacing.xl,
  },
  aiAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md,
    ...Shadow.button,
  },
  aiAvatarText: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  aiAvatarSmall: { width: 30, height: 30, borderRadius: 15, marginBottom: 0 },
  aiAvatarTextSmall: { fontSize: 11 },
  setupTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.3 },
  setupSub: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.md },
  setupHint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.md, textAlign: 'center' },
  banner: {
    backgroundColor: Colors.accentLight, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, marginTop: Spacing.md, width: '100%',
  },
  bannerText: { fontSize: 13, fontWeight: '500', color: Colors.accent, textAlign: 'center' },

  formLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6, marginTop: Spacing.md, alignSelf: 'flex-start' },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.textPrimary, width: '100%',
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceHover, borderWidth: 1, borderColor: Colors.borderLight,
  },
  chipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },
  primaryBtn: {
    backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: BorderRadius.lg,
    alignItems: 'center', marginTop: Spacing.lg, width: '100%', ...Shadow.button,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  // ---- Chat ----
  errorBar: {
    backgroundColor: '#fef0f0', marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md,
  },
  errorText: { fontSize: 12, color: Colors.danger },
  chatList: { flex: 1 },
  chatContent: { padding: Spacing.lg, paddingBottom: Spacing.lg },

  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginTop: Spacing.md },
  emptySub: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: Spacing.lg },
  quickChip: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, ...Shadow.card,
  },
  quickChipText: { fontSize: 13, color: Colors.textSecondary },

  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.md, alignItems: 'flex-end', gap: 8 },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
  },
  userBubble: { backgroundColor: Colors.accent, borderBottomRightRadius: 6 },
  aiBubble: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderBottomLeftRadius: 6, ...Shadow.card,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  aiBubbleText: { color: Colors.textPrimary },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: Colors.textMuted },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  foodGenCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.accentLight, marginHorizontal: Spacing.md, marginTop: Spacing.md,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.accentMuted,
  },
  foodGenTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  foodGenMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  foodGenBtn: {
    backgroundColor: Colors.accent, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 9, ...Shadow.button,
  },
  foodGenBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  chatInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: Colors.textPrimary,
    maxHeight: 110, backgroundColor: Colors.surface,
  },
  sendBtn: {
    backgroundColor: Colors.accent, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
    ...Shadow.button,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  clearBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  clearBtnText: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
});
