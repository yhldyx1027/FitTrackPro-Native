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
  Dimensions, PixelRatio, Modal, Clipboard,
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
import {
  loadAiSettings, saveAiSettings,
  loadAiConversations, saveAiConversations, deleteAiConversation,
  AiConversation,
} from '../storage/storage';
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
  '记录一下我中午吃了半只鸡和一碗面',
  '我刚吃了一个汉堡和一份薯条，算算热量',
  '帮我安排今天的一日三餐',
  '训练日碳水和蛋白质怎么配',
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

// Heuristic: does the user's message describe what they ate, or ask to
// add/edit a food library item? Used to decide whether a silent structured-data
// retry is worthwhile (helps long conversations where the model drifts).
function looksLikeFoodIntent(msg: string): boolean {
  const hasEat = /吃了|喝了|吃过|吃完|早餐|午餐|晚餐|加餐|ate|had|eaten|meal|breakfast|lunch|dinner/i.test(msg);
  const hasAmount = /(\d+\s*(克|g|kg|gram|grams)|碗|个|份|根|杯|盘|只|半|块|片|bowl|cup|plate|piece)/i.test(msg);
  const hasEdit = /(添加|加入|新增|更新|修改|编辑|改成|换成|调整|纠正|热量不对|数据不对|帮我加|加一条|删掉)/.test(msg)
    && /(食物|库|热量|碳水|蛋白|脂肪|千卡|卡路里|食物库)/.test(msg);
  return (hasEat && hasAmount) || hasEdit;
}

// Heuristic: does the user's message ask to GENERATE a training plan?
function looksLikePlanRequest(msg: string): boolean {
  return /(生成|创建|设计|安排|制定|给).*计划/.test(msg) || /(生成|创建|设计).*训练/.test(msg);
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
  const [foodAdded, setFoodAdded] = useState(false);
  const [foodExists, setFoodExists] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedTrainingPlan | null>(null);
  const [planAdded, setPlanAdded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

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
      const [s, convs] = await Promise.all([loadAiSettings(), loadAiConversations(mode)]);
      setSettings(s);
      setConversations(convs);
      if (s) {
        setApiKey(s.apiKey);
        setModel(s.model);
      }
      // Restore the most recent conversation (stored newest-first).
      const last = convs[0];
      if (last && last.messages.length > 0) {
        setMessages(last.messages.map(m => ({ id: m.id, role: m.role, text: m.text })));
        setActiveConvId(last.id);
      }
      setLoaded(true);
    })();
  }, [mode]);

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

  const handleAddFood = async () => {
    if (!generatedFood) return;
    const exists = app.foodDb.some(f => f.name === generatedFood.name);
    if (exists) {
      // Update the existing library entry in place (AI asked to edit it).
      await app.replaceFoodDb(app.foodDb.map(f => (f.name === generatedFood.name ? generatedFood : f)));
    } else {
      await app.replaceFoodDb([...app.foodDb, generatedFood]);
    }
    setFoodAdded(true);
  };

  const handleAddPlan = async () => {
    if (!generatedPlan) return;
    try {
      const newPlan: TrainingPlan = {
        id: createId('plan'),
        name: generatedPlan.name,
        notes: generatedPlan.notes,
        estimatedDurationMinutes: generatedPlan.estimatedDurationMinutes,
        exercises: generatedPlan.exercises.map(ex => ({
          id: createId('exercise'),
          name: ex.name,
          sets: ex.sets.map(s => ({ id: createId('plan-set'), reps: s.reps, weight: s.weight })),
          exerciseType: ex.exerciseType,
          met: null,
          bodyweightLoadFactor: 0.7,
        })),
      };
      await app.upsertPlan(newPlan);
      setPlanAdded(true);
    } catch {
      setError('添加训练计划失败，请重试');
    }
  };

  const copyMessage = (m: ChatMsg) => {
    Clipboard.setString(m.text);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(v => (v === m.id ? null : v)), 2000);
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
        todayTrainingLogs: app.todayTrainingLogs,
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
      foodDb: app.foodDb,
      trainingLogs: app.todayTrainingLogs,
      isTrainingDay: app.isTrainingDay,
      trainingCal: app.trainingCal,
      recentTrainingLogs,
      recentDietLogs,
      weightHistory,
    };
    return buildAiSystemPrompt(dctx);
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  };

  const persistConvs = async (next: AiConversation[]) => {
    setConversations(next);
    await saveAiConversations(mode, next);
  };

  const handleClear = async () => {
    setMessages([]);
    setGeneratedFood(null);
    setFoodAdded(false);
    setFoodExists(false);
    setGeneratedPlan(null);
    setPlanAdded(false);
    if (!activeConvId) return;
    const id = activeConvId;
    setActiveConvId(null);
    await deleteAiConversation(mode, id);
    setConversations(prev => prev.filter(c => c.id !== id));
  };

  const handleNewConversation = async () => {
    const conv: AiConversation = {
      id: createId('conv'),
      mode,
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    setMessages([]);
    setGeneratedFood(null);
    setFoodAdded(false);
    setFoodExists(false);
    setGeneratedPlan(null);
    setPlanAdded(false);
    setActiveConvId(conv.id);
    setHistoryVisible(false);
    await persistConvs([conv, ...conversations]);
  };

  const handleOpenConversation = async (conv: AiConversation) => {
    setMessages(conv.messages.map(m => ({ id: m.id, role: m.role, text: m.text })));
    setActiveConvId(conv.id);
    setGeneratedFood(null);
    setFoodAdded(false);
    setFoodExists(false);
    setGeneratedPlan(null);
    setPlanAdded(false);
    setHistoryVisible(false);
    const next = conversations.map(c =>
      c.id === conv.id ? { ...c, updatedAt: Date.now() } : c
    );
    await persistConvs(next);
  };

  useEffect(() => {
    navigation.setOptions({
      title: isTraining ? 'AI 训练助手' : 'AI 饮食助手',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 92 }}>
          {messages.length > 0 && (
            <PressableScale onPress={handleClear} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>清空</Text>
            </PressableScale>
          )}
          <PressableScale onPress={() => setHistoryVisible(true)} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>历史</Text>
          </PressableScale>
        </View>
      ),
    });
  }, [navigation, messages.length, isTraining, handleClear]);

  const send = async (raw?: string) => {
    const content = (raw ?? input).trim();
    if (!content || loading || !settings) return;

    const userMsg: ChatMsg = { id: newId(), role: 'user', text: content };
    const history = messages.map(m => ({ role: m.role, content: m.text }));
    const baseMessages = messages;
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setError('');
    setGeneratedFood(null);
    setFoodAdded(false);
    setFoodExists(false);
    setGeneratedPlan(null);
    setPlanAdded(false);
    setLoading(true);

    let convId = activeConvId;
    if (!convId) {
      // First message of a brand-new conversation.
      convId = createId('conv');
      const conv: AiConversation = {
        id: convId, mode, title: '', createdAt: Date.now(), updatedAt: Date.now(), messages: [],
      };
      await persistConvs([conv, ...conversations]);
      setActiveConvId(convId);
    }

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
      const assistantMsg: ChatMsg = { id: newId(), role: 'assistant', text: visibleText || reply };
      const finalMessages = [...baseMessages, userMsg, assistantMsg];
      setMessages(finalMessages);

      if (isTraining) {
        let plan = extractTrainingPlanFromReply(reply);
        // Some turns make the model forget the structured marker. If the user
        // clearly asked to generate a plan but none was parsed, silently retry
        // once asking only for the structured data.
        if (!plan && looksLikePlanRequest(content)) {
          try {
            const retryReply = await chatWithDeepSeek(
              settings.apiKey,
              settings.model,
              [
                ...history,
                { role: 'user', content },
                { role: 'assistant', content: reply },
                { role: 'user', content: '请只输出刚才生成的训练计划结构化数据：__PLAN_JSON__{"name":"...","notes":"...","estimatedDurationMinutes":...,"exercises":[{"name":"...","exerciseType":"weighted|bodyweight|cardio","sets":[{"reps":...,"weight":...}]}]}__END__，不要输出任何其他内容。' },
              ],
              buildSystemPrompt()
            );
            plan = extractTrainingPlanFromReply(retryReply);
          } catch {
            // ignore retry failure, fall through without a generated plan
          }
        }
        if (plan) {
          // Do NOT auto-save: wait for the user to tap "添加到计划库".
          setGeneratedPlan(plan);
          setPlanAdded(false);
        }
      } else {
        let food = extractFoodFromReply(reply);
        // Long conversations sometimes make the model forget the structured
        // marker. If the user clearly described what they ate but no food was
        // parsed, silently retry once asking only for the structured data.
        if (!food && looksLikeFoodIntent(content)) {
          try {
            const retryReply = await chatWithDeepSeek(
              settings.apiKey,
              settings.model,
              [
                ...history,
                { role: 'user', content },
                { role: 'assistant', content: reply },
                { role: 'user', content: '请只输出刚才那顿饭的结构化数据：__FOOD_JSON__{"name":"...","calories":...,"carbs":...,"protein":...,"fat":...}__END__，不要输出任何其他内容。' },
              ],
              buildSystemPrompt()
            );
            food = extractFoodFromReply(retryReply);
          } catch {
            // ignore retry failure, fall through without a generated food
          }
        }
        if (food) {
          // Do NOT auto-save: wait for the user to tap "添加到食物库".
          const exists = app.foodDb.some(f => f.name === food.name);
          setFoodExists(exists);
          setFoodAdded(false);
          setGeneratedFood(food);
        }
      }

      // Persist the conversation.
      const title = userMsg.text.length > 18 ? userMsg.text.slice(0, 18) + '…' : userMsg.text;
      const updated = conversations.map(c =>
        c.id === convId
          ? { ...c, title: c.title || title, updatedAt: Date.now(), messages: finalMessages }
          : c
      );
      if (!updated.some(c => c.id === convId)) {
        updated.push({
          id: convId as string, mode, title, createdAt: Date.now(), updatedAt: Date.now(),
          messages: finalMessages,
        });
      }
      await persistConvs(updated);
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
                <View key={m.id} style={styles.msgWrap}>
                  <View style={[styles.bubbleRow, m.role === 'user' ? styles.userRow : styles.aiRow]}>
                    {m.role === 'assistant' && (
                      <View style={[styles.aiAvatar, styles.aiAvatarSmall]}>
                        <Text style={[styles.aiAvatarText, styles.aiAvatarTextSmall]}>AI</Text>
                      </View>
                    )}
                    <PressableScale
                      onLongPress={() => copyMessage(m)}
                      delayLongPress={350}
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
                    </PressableScale>
                  </View>
                  <PressableScale
                    onPress={() => copyMessage(m)}
                    style={[styles.copyBtn, m.role === 'user' ? styles.copyBtnUser : styles.copyBtnAi]}
                  >
                    <Text style={styles.copyBtnText}>{copiedId === m.id ? '已复制 ✓' : '复制'}</Text>
                  </PressableScale>
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
                <Text style={styles.foodGenTitle}>
                  {foodAdded
                    ? (foodExists ? '已更新食物库' : '已添加到食物库')
                    : foodExists
                      ? '该食物已在食物库中，可点击更新'
                      : '已生成食物，点击添加入库'}
                </Text>
                <Text style={styles.foodGenMeta}>
                  {generatedFood.name}｜{generatedFood.calories}千卡｜碳{generatedFood.carbs} 蛋{generatedFood.protein} 脂{generatedFood.fat}
                </Text>
              </View>
              {foodAdded ? (
                <PressableScale style={styles.foodGenBtn} onPress={goAddFood}>
                  <Text style={styles.foodGenBtnText}>去饮食页查看</Text>
                </PressableScale>
              ) : (
                <PressableScale style={styles.foodGenBtn} onPress={handleAddFood}>
                  <Text style={styles.foodGenBtnText}>{foodExists ? '更新食物库' : '添加到食物库'}</Text>
                </PressableScale>
              )}
            </View>
          )}

          {generatedPlan && isTraining && (
            <View style={styles.foodGenCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodGenTitle}>{planAdded ? '已添加到计划库' : '已生成训练计划，点击添加入库'}</Text>
                <Text style={styles.foodGenMeta}>
                  {generatedPlan.name}｜{generatedPlan.exercises.length}个动作｜约{generatedPlan.estimatedDurationMinutes ?? '?'}分钟
                </Text>
              </View>
              {planAdded ? (
                <PressableScale style={styles.foodGenBtn} onPress={goAddPlan}>
                  <Text style={styles.foodGenBtnText}>去训练页查看</Text>
                </PressableScale>
              ) : (
                <PressableScale style={styles.foodGenBtn} onPress={handleAddPlan}>
                  <Text style={styles.foodGenBtnText}>添加到计划库</Text>
                </PressableScale>
              )}
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

          {/* Conversation history */}
          <Modal
            visible={historyVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setHistoryVisible(false)}
          >
            <View style={styles.historyModal}>
              <View style={styles.historyHeader}>
                <View>
                  <Text style={styles.historyTitle}>对话历史</Text>
                  <Text style={styles.historySub}>最多保留 5 个对话，可随时切换或新建</Text>
                </View>
                <PressableScale onPress={() => setHistoryVisible(false)} style={styles.historyCloseBtn}>
                  <Text style={styles.historyCloseText}>关闭</Text>
                </PressableScale>
              </View>

              <PressableScale style={styles.newConvBtn} onPress={handleNewConversation}>
                <Text style={styles.newConvBtnText}>+ 新建对话</Text>
              </PressableScale>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Spacing.section }}>
                {conversations.filter(c => c.messages.length > 0).map(c => (
                  <PressableScale
                    key={c.id}
                    style={[styles.historyItem, c.id === activeConvId && styles.historyItemActive]}
                    onPress={() => handleOpenConversation(c)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyItemTitle} numberOfLines={1}>{c.title || '（未命名对话）'}</Text>
                      <Text style={styles.historyItemMeta}>
                        {c.messages.length} 条消息 · {fmtDate(c.updatedAt)}
                      </Text>
                    </View>
                    {c.id === activeConvId && <Text style={styles.historyItemCurrent}>当前</Text>}
                  </PressableScale>
                ))}
                {conversations.filter(c => c.messages.length > 0).length === 0 && (
                  <Text style={styles.historyEmpty}>还没有历史对话，点"新建对话"开始</Text>
                )}
              </ScrollView>
            </View>
          </Modal>
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

  msgWrap: { marginBottom: Spacing.sm },
  copyBtn: { alignSelf: 'flex-start', paddingHorizontal: 2, paddingVertical: 2, marginTop: 2 },
  copyBtnUser: { alignSelf: 'flex-end', marginRight: 6 },
  copyBtnAi: { marginLeft: 38 },
  copyBtnText: { fontSize: 11, color: Colors.textMuted },

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

  // ---- History ----
  historyModal: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? 48 : 16 },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  historyTitle: { ...Typography.title, fontSize: 19 },
  historySub: { ...Typography.caption, marginTop: 2 },
  historyCloseBtn: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  historyCloseText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  newConvBtn: {
    backgroundColor: Colors.accent, borderRadius: BorderRadius.lg, marginHorizontal: Spacing.lg,
    paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.button,
  },
  newConvBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.card,
  },
  historyItemActive: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  historyItemTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  historyItemMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  historyItemCurrent: { fontSize: 12, fontWeight: '600', color: Colors.accent },
  historyEmpty: {
    ...Typography.caption, textAlign: 'center', marginTop: Spacing.xxxl,
  },
});
