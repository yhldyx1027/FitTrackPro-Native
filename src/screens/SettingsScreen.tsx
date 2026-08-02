// ============================================================
// FitTrack Pro - Settings Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { fmtNum, parseNum, GOAL_LABELS, GENDER_LABELS } from '../utils/calculations';
import { Gender, Goal } from '../types';
import PressableScale from '../components/PressableScale';
import DecimalInput from '../components/DecimalInput';
import { AI_MODELS, DEFAULT_AI_MODEL, AiSettings } from '../services/ai';
import { loadAiSettings, saveAiSettings } from '../storage/storage';

export default function SettingsScreen({ navigation }: any) {
  const app = useApp();
  if (!app.ready) return null;

  const { profile } = app;
  const [draft, setDraft] = useState({ ...profile });
  const [saved, setSaved] = useState(!!(profile.height && profile.weight));
  const [msg, setMsg] = useState('');

  // AI assistant configuration
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [aiEditor, setAiEditor] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [aiMsg, setAiMsg] = useState('');

  useEffect(() => {
    (async () => {
      const s = await loadAiSettings();
      setAi(s);
      if (s) {
        setAiKey(s.apiKey);
        setAiModel(s.model);
      }
    })();
  }, []);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2400);
  };

  const showAiMsg = (text: string) => {
    setAiMsg(text);
    setTimeout(() => setAiMsg(''), 2400);
  };

  const handleSaveAi = async () => {
    const key = aiKey.trim();
    if (!key) {
      showAiMsg('请先粘贴 DeepSeek API Key');
      return;
    }
    await saveAiSettings({ apiKey: key, model: aiModel });
    setAi({ apiKey: key, model: aiModel });
    setAiEditor(false);
    showAiMsg('AI 配置已保存');
  };

  const handleUpdate = (field: string, value: string) => {
    setDraft(prev => ({ ...prev, [field]: parseNum(value) }));
  };

  const handleSave = async () => {
    // Validate activityFactor: documented standard range 1.2 ~ 2.5
    if (draft.activityFactor != null) {
      if (draft.activityFactor > 2.5) {
        showMsg('活动系数过大，标准值范围 1.2~2.5，你是否多输了小数位？');
        return;
      }
      if (draft.activityFactor < 1.2) {
        showMsg('活动系数过小，标准值范围 1.2~2.5');
        return;
      }
    }
    await app.updateProfile(draft);
    setSaved(true);
    showMsg('身体数据已更新');
  };

  const handleClearHistory = () => {
    Alert.alert('清理历史记录', '清除所有训练和饮食记录。训练计划库和食物库不受影响。', [
      { text: '取消', style: 'cancel' },
      { text: '确认清理', style: 'destructive', onPress: async () => { await app.clearHistory(); showMsg('历史记录已清理'); } },
    ]);
  };

  const handleReset = () => {
    Alert.alert('重置数据', '清空身体数据、训练历史和饮食历史。训练计划库和食物库保留。', [
      { text: '取消', style: 'cancel' },
      { text: '确认重置', style: 'destructive', onPress: async () => {
        await app.resetData();
        setSaved(false);
        setDraft({ height: null, weight: null, age: null, gender: null, goal: null, activityFactor: null });
        showMsg('数据已重置');
      } },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {msg !== '' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{msg}</Text>
        </View>
      )}

      {/* Profile */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>身体数据</Text>
        <Text style={styles.cardSub}>这些数值直接影响 BMR、TDEE 和饮食建议。</Text>

        {saved ? (
          <PressableScale style={styles.profileSummary} onPress={() => setSaved(false)}>
            <View style={styles.summaryAvatar}>
              <Text style={styles.summaryAvatarText}>
                {draft.gender ? GENDER_LABELS[draft.gender][0] : '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryName}>
                {(draft.gender ? GENDER_LABELS[draft.gender] + ' · ' : '')}
                {(draft.height ? draft.height + 'cm' : '?')} · {(draft.weight ? draft.weight + 'kg' : '?')}
              </Text>
              <Text style={styles.summaryDetail}>
                年龄 {draft.age || '?'} · {draft.goal ? GOAL_LABELS[draft.goal] : '?'} · 活动系数 {draft.activityFactor || '?'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        ) : (
          <View>
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>身高（厘米）</Text>
                <TextInput style={styles.input} value={fmtNum(draft.height)} onChangeText={t => handleUpdate('height', t)} placeholder="175" keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>体重（千克）</Text>
                <TextInput style={styles.input} value={fmtNum(draft.weight)} onChangeText={t => handleUpdate('weight', t)} placeholder="70" keyboardType="number-pad" />
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>年龄</Text>
                <TextInput style={styles.input} value={fmtNum(draft.age)} onChangeText={t => handleUpdate('age', t)} placeholder="30" keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>活动系数</Text>
                <DecimalInput style={styles.input} value={draft.activityFactor} onValue={n => setDraft(d => ({ ...d, activityFactor: n }))} placeholder="1.375" />
                <Text style={styles.formHint}>久坐1.2  轻度1.375  中度1.55  高强度1.725+</Text>
              </View>
            </View>

            <Text style={styles.formLabel}>性别</Text>
            <View style={styles.chipRow}>
              {(['male', 'female'] as Gender[]).map(g => (
                <PressableScale key={g} style={[styles.chip, draft.gender === g && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, gender: g }))}>
                  <Text style={[styles.chipText, draft.gender === g && styles.chipTextActive]}>{GENDER_LABELS[g]}</Text>
                </PressableScale>
              ))}
            </View>

            <Text style={styles.formLabel}>目标</Text>
            <View style={styles.chipRow}>
              {(['cutting', 'maintenance', 'bulking'] as Goal[]).map(g => (
                <PressableScale key={g} style={[styles.chip, draft.goal === g && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, goal: g }))}>
                  <Text style={[styles.chipText, draft.goal === g && styles.chipTextActive]}>{GOAL_LABELS[g]}</Text>
                </PressableScale>
              ))}
            </View>

            <PressableScale style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>保存身体数据</Text>
            </PressableScale>
          </View>
        )}
      </View>

      {/* AI Assistant */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI 饮食助手</Text>
        <Text style={styles.cardSub}>用 DeepSeek 查询食物热量、碳蛋脂配置与三餐搭配。API Key 仅保存在本机。</Text>

        <View style={styles.aiStatusRow}>
          <View style={[styles.aiStatusDot, ai ? styles.aiStatusDotOn : null]} />
          <Text style={styles.aiStatusText}>
            {ai
              ? `已配置 · ${AI_MODELS.find(m => m.value === ai.model)?.label ?? ai.model}`
              : '未配置 API Key'}
          </Text>
        </View>

        {ai && (
          <PressableScale style={styles.primaryBtn} onPress={() => navigation.navigate('AiChatPage')}>
            <Text style={styles.primaryBtnText}>打开 AI 饮食助手</Text>
          </PressableScale>
        )}

        <PressableScale
          style={styles.outlineBtn}
          onPress={() => setAiEditor(v => !v)}
        >
          <Text style={styles.outlineBtnText}>
            {aiEditor ? '收起配置' : ai ? '修改 API Key / 模型' : '配置 API Key'}
          </Text>
        </PressableScale>

        {aiMsg !== '' && (
          <View style={styles.aiMsgBanner}>
            <Text style={styles.aiMsgText}>{aiMsg}</Text>
          </View>
        )}

        {aiEditor && (
          <View>
            <Text style={styles.formLabel}>DeepSeek API Key</Text>
            <TextInput
              style={styles.input}
              value={aiKey}
              onChangeText={setAiKey}
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
                  style={[styles.chip, aiModel === m.value && styles.chipActive]}
                  onPress={() => setAiModel(m.value)}
                >
                  <Text style={[styles.chipText, aiModel === m.value && styles.chipTextActive]}>{m.label}</Text>
                </PressableScale>
              ))}
            </View>

            <PressableScale style={styles.primaryBtn} onPress={handleSaveAi}>
              <Text style={styles.primaryBtnText}>保存 AI 配置</Text>
            </PressableScale>
          </View>
        )}
      </View>

      {/* Storage */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>本地存储</Text>
        <Text style={styles.cardSub}>数据仅保存在此设备。核心功能离线可用。</Text>
        <View style={styles.storagePath}>
          <Text style={styles.storagePathText}>AsyncStorage://fittrack-pro</Text>
        </View>
        <PressableScale style={styles.outlineBtn} onPress={() => { app.refreshAll(); showMsg('本地数据已重新读取'); }}>
          <Text style={styles.outlineBtnText}>重新读取本地数据</Text>
        </PressableScale>
        <PressableScale style={styles.warnBtn} onPress={handleClearHistory}>
          <Text style={styles.warnBtnText}>清理历史记录</Text>
        </PressableScale>
        <PressableScale style={styles.dangerBtn} onPress={handleReset}>
          <Text style={styles.dangerBtnText}>重置数据（保留计划和食物库）</Text>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },

  banner: {
    backgroundColor: Colors.accentLight, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg, marginBottom: Spacing.lg,
  },
  bannerText: { fontSize: 14, fontWeight: '500', color: Colors.accent, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, marginBottom: Spacing.lg, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTitle: { ...Typography.title, marginBottom: 4 },
  cardSub: { ...Typography.caption, marginBottom: Spacing.lg },

  profileSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.lg, padding: Spacing.lg,
  },
  summaryAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accentLight,
    justifyContent: 'center', alignItems: 'center',
  },
  summaryAvatarText: { fontSize: 18, fontWeight: '700', color: Colors.accent },
  summaryName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  summaryDetail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 20, color: Colors.textMuted },

  formRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  formLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6, marginTop: Spacing.md },
  formHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.textPrimary,
  },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceHover, borderWidth: 1, borderColor: Colors.borderLight,
  },
  chipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },

  primaryBtn: {
    backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: BorderRadius.lg,
    alignItems: 'center', marginTop: Spacing.lg, ...Shadow.button,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  outlineBtn: {
    borderWidth: 1, borderColor: Colors.border, paddingVertical: 14,
    borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.md,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  warnBtn: {
    backgroundColor: '#fef3e6', paddingVertical: 14, borderRadius: BorderRadius.lg,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  warnBtnText: { fontSize: 15, fontWeight: '500', color: Colors.warning },
  dangerBtn: {
    backgroundColor: '#fef0f0', paddingVertical: 14, borderRadius: BorderRadius.lg,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  dangerBtnText: { fontSize: 15, fontWeight: '500', color: Colors.danger },

  storagePath: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.md, alignItems: 'center',
  },
  storagePathText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'monospace' },

  aiStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.md,
  },
  aiStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  aiStatusDotOn: { backgroundColor: Colors.success },
  aiStatusText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  aiMsgBanner: {
    backgroundColor: Colors.accentLight, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, marginTop: Spacing.md,
  },
  aiMsgText: { fontSize: 13, fontWeight: '500', color: Colors.accent, textAlign: 'center' },
});
