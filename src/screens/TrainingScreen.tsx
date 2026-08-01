// ============================================================
// FitTrack Pro - Training Screen
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput,
  StyleSheet, Modal, AppState, AppStateStatus, StatusBar, Alert,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { toR, fmtNum, parseNum, createId } from '../utils/calculations';
import { TrainingPlan, Exercise, ExerciseType, WorkoutSet, PlanSet } from '../types';
import PressableScale from '../components/PressableScale';

// ---- Exercise type options ----
const exerciseTypes: { v: ExerciseType; l: string }[] = [
  { v: 'weighted', l: '负重' },
  { v: 'bodyweight', l: '自重' },
  { v: 'cardio', l: '有氧' },
];

// ---- Main Screen ----

export default function TrainingScreen({ navigation }: any) {
  const app = useApp();
  if (!app.ready) return null;

  const { todayWorkout, todayTrainingLog, trainingCal, trainingVol, plans } = app;
  const [planEditorVisible, setPlanEditorVisible] = useState(false);
  const [workoutVisible, setWorkoutVisible] = useState(false);

  const handleStartWorkout = (plan: TrainingPlan) => {
    app.startWorkoutFromPlan(plan);
    setWorkoutVisible(true);
  };

  const handleDeletePlan = (p: TrainingPlan) => {
    Alert.alert('删除计划', `确定删除“${p.name || '未命名计划'}”？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => app.removePlan(p.id) },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Today's Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>今日训练</Text>
        <Text style={styles.cardSub}>没有训练时视为休息日，饮食建议实时切换</Text>
        {todayWorkout ? (
          <View>
            <View style={styles.workoutSummary}>
              <Text style={styles.workoutName}>{todayWorkout.sourcePlanName}</Text>
              <Text style={styles.workoutMeta}>
                实时容量 {toR(trainingVol)} · 预计消耗 {toR(trainingCal)} 千卡
              </Text>
              <PressableScale style={styles.primaryBtn} onPress={() => setWorkoutVisible(true)}>
                <Text style={styles.primaryBtnText}>继续训练</Text>
              </PressableScale>
            </View>
          </View>
        ) : todayTrainingLog ? (
          <View style={styles.workoutSummary}>
            <Text style={styles.workoutName}>今天已完成训练</Text>
            <Text style={styles.workoutMeta}>
              {todayTrainingLog.planUsed} · 容量 {toR(todayTrainingLog.volume)} · 消耗 {toR(todayTrainingLog.calories)} 千卡
            </Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>今天还没有训练，当前按休息日饮食方案计算。</Text>
        )}
      </View>

      {/* Plan Library */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>训练计划库</Text>
        <Text style={styles.cardSub}>每个计划定义了动作、组数和重量</Text>
        {plans.map(p => {
          const exCount = p.exercises.length;
          const setCount = p.exercises.reduce((s, e) => s + e.sets.length, 0);
          const initial = (p.name || '?')[0];
          const preview = p.exercises.slice(0, 3).map(e => e.name || '未命名动作').join(' · ');
          const previewMore = exCount > 3 ? ` · 等${exCount}个动作` : '';
          return (
            <View key={p.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planIcon}><Text style={styles.planIconText}>{initial}</Text></View>
                <View style={styles.planBody}>
                  <Text style={styles.planName} numberOfLines={1}>{p.name || '未命名计划'}</Text>
                  <Text style={styles.planMeta}>{exCount}个动作 · {setCount}组{p.estimatedDurationMinutes ? ` · ${p.estimatedDurationMinutes}分钟` : ''}</Text>
                </View>
              </View>
              {preview !== '' && (
                <View style={styles.planPreview}>
                  <Text style={styles.planPreviewText} numberOfLines={1}>{preview}{previewMore}</Text>
                </View>
              )}
              <View style={styles.planFooter}>
                <View style={styles.planFooterLeft}>
                  <PressableScale style={styles.planGhostBtn} onPress={() => { setEditingPlan(p); setPlanEditorVisible(true); }}>
                    <Text style={styles.planGhostText}>编辑</Text>
                  </PressableScale>
                  <PressableScale style={styles.planGhostBtn} onPress={() => handleDeletePlan(p)}>
                    <Text style={[styles.planGhostText, { color: Colors.danger }]}>删除</Text>
                  </PressableScale>
                </View>
                <PressableScale style={styles.planStartBtn} onPress={() => handleStartWorkout(p)}>
                  <Text style={styles.planStartText}>开始训练</Text>
                </PressableScale>
              </View>
            </View>
          );
        })}
        {plans.length === 0 && (
          <View style={styles.planEmpty}>
            <Text style={styles.planEmptyTitle}>还没有训练计划</Text>
            <Text style={styles.planEmptySub}>创建一个计划，定义动作、组数和重量，随时开始训练</Text>
          </View>
        )}
        <PressableScale style={styles.newPlanBtn} onPress={() => { setEditingPlan(null); setPlanEditorVisible(true); }}>
          <Text style={styles.newPlanBtnText}>+ 新建训练计划</Text>
        </PressableScale>
      </View>

      {/* Plan Editor Modal */}
      <PlanEditorModal visible={planEditorVisible} onClose={() => setPlanEditorVisible(false)} onSave={app.upsertPlan} createBlankPlan={app.createBlankPlan} />

      {/* Workout Modal */}
      <WorkoutModal visible={workoutVisible} onClose={() => setWorkoutVisible(false)} />
    </ScrollView>
  );
}

// ---- Plan Editor ----

let editingPlan: TrainingPlan | null = null;

function setEditingPlan(p: TrainingPlan | null) {
  editingPlan = p ? JSON.parse(JSON.stringify(p)) : null;
}

function PlanEditorModal({ visible, onClose, onSave, createBlankPlan }: {
  visible: boolean; onClose: () => void;
  onSave: (p: TrainingPlan) => Promise<void>;
  createBlankPlan: () => TrainingPlan;
}) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [, forceUpdate] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [expandedEx, setExpandedEx] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      const p = editingPlan || createBlankPlan();
      setPlan(JSON.parse(JSON.stringify(p)));
      setAdvancedOpen({});
      setExpandedEx({}); // exercise blocks default collapsed
    }
  }, [visible]);

  if (!visible || !plan) return null;

  const refresh = () => forceUpdate(n => n + 1);

  const readForm = () => {
    // Read values from plan state (they're updated via onChangeText)
    return plan;
  };

  const handleSave = async () => {
    const p = readForm();
    if (!p.name.trim()) {
      Alert.alert('提示', '请先填写计划名称');
      return;
    }
    await onSave(p);
    onClose();
  };

  const toggleExpand = (id: string) => setExpandedEx(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <PressableScale onPress={onClose} style={styles.modalIconBtn}><Text style={styles.modalBack}>←</Text></PressableScale>
          <Text style={styles.modalTitle}>{editingPlan ? '编辑计划' : '新建计划'}</Text>
          <PressableScale onPress={handleSave} style={styles.modalIconBtn}><Text style={styles.modalSave}>保存</Text></PressableScale>
        </View>
        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled">
          {/* 基本信息 */}
          <Text style={styles.sectionTitle}>基本信息</Text>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>计划名称</Text>
            <TextInput style={styles.input} value={plan.name} onChangeText={t => { plan.name = t; refresh(); }} placeholder="例如 上肢推" placeholderTextColor={Colors.textMuted} />

            <Text style={[styles.formLabel, styles.formLabelGap]}>预计时长</Text>
            <View style={styles.durationRow}>
              <TextInput style={[styles.input, styles.durationInput]} value={fmtNum(plan.estimatedDurationMinutes)} onChangeText={t => { plan.estimatedDurationMinutes = parseNum(t); refresh(); }} placeholder="45" keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />
              <Text style={styles.durationUnit}>分钟</Text>
            </View>
          </View>

          {/* 动作列表 */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>动作列表</Text>
            <View style={styles.countBadge}><Text style={styles.countBadgeText}>{plan.exercises.length}</Text></View>
          </View>

          {plan.exercises.map((ex, i) => {
            const expanded = !!expandedEx[ex.id];
            return (
              <View key={ex.id} style={styles.exerciseBlock}>
                <View style={styles.exHeader}>
                  <PressableScale style={styles.exBadge} onPress={() => toggleExpand(ex.id)}>
                    <Text style={styles.exBadgeText}>{i + 1}</Text>
                  </PressableScale>
                  <TextInput
                    style={styles.exNameInput}
                    value={ex.name}
                    onChangeText={t => { ex.name = t; refresh(); }}
                    placeholder="动作名称"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <PressableScale style={styles.miniBtn} onPress={() => toggleExpand(ex.id)}>
                    <Text style={styles.miniBtnText}>{expanded ? '收起' : '展开'}</Text>
                  </PressableScale>
                  <View style={styles.exHeaderActions}>
                    <PressableScale style={[styles.miniBtn, i === 0 && styles.miniBtnDisabled]} onPress={() => { const idx = plan.exercises.findIndex(e => e.id === ex.id); if (idx > 0) { [plan.exercises[idx], plan.exercises[idx - 1]] = [plan.exercises[idx - 1], plan.exercises[idx]]; refresh(); } }}>
                      <Text style={styles.miniBtnText}>上移</Text>
                    </PressableScale>
                    <PressableScale style={[styles.miniBtn, i === plan.exercises.length - 1 && styles.miniBtnDisabled]} onPress={() => { const idx = plan.exercises.findIndex(e => e.id === ex.id); if (idx < plan.exercises.length - 1) { [plan.exercises[idx], plan.exercises[idx + 1]] = [plan.exercises[idx + 1], plan.exercises[idx]]; refresh(); } }}>
                      <Text style={styles.miniBtnText}>下移</Text>
                    </PressableScale>
                  </View>
                </View>

                {expanded && (
                  <>
                    <Text style={[styles.formLabel, styles.formLabelGap]}>动作类型</Text>
                    <View style={styles.typeGrid}>
                      {exerciseTypes.map(et => {
                        const active = ex.exerciseType === et.v;
                        return (
                          <PressableScale key={et.v} style={[styles.typeOption, active && styles.typeOptionActive]} onPress={() => { ex.exerciseType = et.v; refresh(); }}>
                            <View style={styles.typeTop}>
                              <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{et.l}</Text>
                              {active && <View style={styles.typeCheck}><Text style={styles.typeCheckText}>✓</Text></View>}
                            </View>
                          </PressableScale>
                        );
                      })}
                    </View>

                    {/* 热量参数（默认折叠） */}
                    <PressableScale style={styles.advToggle} onPress={() => setAdvancedOpen(prev => ({ ...prev, [ex.id]: !prev[ex.id] }))}>
                      <Text style={styles.advToggleText}>热量参数（MET / 受力系数）</Text>
                      <Text style={styles.advToggleIcon}>{advancedOpen[ex.id] ? '−' : '+'}</Text>
                    </PressableScale>
                    {advancedOpen[ex.id] && (
                      <View style={styles.metRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.formLabel}>MET 值</Text>
                          <TextInput style={styles.input} value={fmtNum(ex.met)} onChangeText={t => { ex.met = parseNum(t); refresh(); }} placeholder="默认自动" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                        </View>
                        {ex.exerciseType === 'bodyweight' && (
                          <View style={{ flex: 1 }}>
                            <Text style={styles.formLabel}>受力系数</Text>
                            <TextInput style={styles.input} value={fmtNum(ex.bodyweightLoadFactor)} onChangeText={t => { ex.bodyweightLoadFactor = parseNum(t) ?? 0.7; refresh(); }} keyboardType="decimal-pad" placeholder="0.7" placeholderTextColor={Colors.textMuted} />
                          </View>
                        )}
                      </View>
                    )}

                    {/* 组次 */}
                    <View style={styles.setsCard}>
                      <View style={styles.setHeader}>
                        <Text style={[styles.setHeaderCol, { flex: 1 }]}>组次</Text>
                        <Text style={[styles.setHeaderCol, { width: 68 }]}>{ex.exerciseType === 'cardio' ? '分钟' : '次数'}</Text>
                        {ex.exerciseType === 'weighted' && <Text style={[styles.setHeaderCol, { width: 68 }]}>重量</Text>}
                        <Text style={[styles.setHeaderCol, { width: 40, textAlign: 'center' }]}>操作</Text>
                      </View>
                      {ex.sets.map((st, si) => (
                        <View key={st.id} style={styles.setRow}>
                          <Text style={styles.setIndex} numberOfLines={1}>第 {si + 1} 组</Text>
                          <TextInput style={styles.setInput} value={fmtNum(st.reps)} onChangeText={t => { st.reps = parseNum(t); refresh(); }} placeholder="—" keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />
                          {ex.exerciseType === 'weighted' && (
                            <TextInput style={styles.setInput} value={fmtNum(st.weight)} onChangeText={t => { st.weight = parseNum(t); refresh(); }} placeholder="—" keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />
                          )}
                          <PressableScale style={styles.setDelBtn} onPress={() => { ex.sets = ex.sets.filter(s => s.id !== st.id); refresh(); }}>
                            <Text style={styles.setDelText}>删</Text>
                          </PressableScale>
                        </View>
                      ))}
                      <PressableScale style={styles.addSetBtn} onPress={() => { ex.sets.push({ id: createId('plan-set'), reps: null, weight: null }); refresh(); }}>
                        <Text style={styles.addSetText}>+ 增加一组</Text>
                      </PressableScale>
                    </View>

                    <PressableScale style={styles.removeExBtn} onPress={() => { plan.exercises = plan.exercises.filter(e => e.id !== ex.id); refresh(); }}>
                      <Text style={styles.removeExText}>删除该动作</Text>
                    </PressableScale>
                  </>
                )}
              </View>
            );
          })}

          <PressableScale style={styles.addExBtn} onPress={() => {
            plan.exercises.push({ id: createId('exercise'), name: '', sets: [{ id: createId('plan-set'), reps: null, weight: null }], exerciseType: 'weighted', met: null, bodyweightLoadFactor: 0.7 });
            refresh();
          }}>
            <Text style={styles.addExText}>+ 添加动作</Text>
          </PressableScale>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---- Workout Timer Modal ----

function WorkoutModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useApp();
  const { todayWorkout } = app;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseRef = useRef<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [, forceUpdate] = useState(0);

  // Timer with absolute timestamps (background-safe + survives app restart via startedAt)
  useEffect(() => {
    if (!visible) return;
    if (baseRef.current == null) {
      baseRef.current = todayWorkout?.startedAt ?? Date.now();
    }
    const tick = () => {
      if (baseRef.current != null) {
        setElapsed(Math.max(0, Math.floor((Date.now() - baseRef.current) / 1000)));
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') tick();
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, [visible, todayWorkout]);

  if (!todayWorkout) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timerDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  // Group sets by exercise
  const groupMap = new Map<string, { key: string; exercise: string; type: ExerciseType; order: number; sets: WorkoutSet[] }>();
  todayWorkout.sets.forEach(s => {
    const k = s.exerciseId || s.exercise;
    if (!groupMap.has(k)) groupMap.set(k, { key: k, exercise: s.exercise, type: s.exerciseType, order: s.exerciseOrder, sets: [] });
    groupMap.get(k)!.sets.push(s);
  });
  const groups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);

  // 正在训练的动作（第一个存在未完成组的动作）默认展开，其余折叠
  const activeKey = groups.find(g => g.sets.some(s => !s.completed))?.key ?? null;
  const isExpanded = (key: string) => {
    if (expandedGroups[key] !== undefined) return expandedGroups[key];
    if (activeKey) return key === activeKey;
    return true; // 全部完成 -> 展开所有便于核对
  };
  const toggleGroup = (key: string) => {
    if (key === activeKey) return; // 正在训练的动作保持展开
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateSet = (sid: string, field: 'weight' | 'reps' | 'completed', value: number | boolean) => {
    const next = {
      ...todayWorkout,
      sets: todayWorkout.sets.map(s => s.id === sid ? { ...s, [field]: field === 'completed' ? !s.completed : Number(value) || 0 } : s),
    };
    app.updateWorkout(next);
    forceUpdate(n => n + 1);
  };

  const handleFinish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const next = { ...todayWorkout, durationMinutes: Math.round(elapsed / 60) };
    await app.completeWorkout(next);
    onClose();
  };

  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <PressableScale onPress={handleClose} style={styles.modalIconBtn}><Text style={styles.modalBack}>←</Text></PressableScale>
          <Text style={styles.modalTitle}>{todayWorkout.sourcePlanName}</Text>
          <View style={styles.timerBadge}><Text style={styles.timerDisplay}>{timerDisplay}</Text></View>
        </View>
        <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
          {groups.map((g, i) => {
            const expanded = isExpanded(g.key);
            const done = g.sets.filter(s => s.completed).length;
            const active = g.key === activeKey;
            return (
              <View key={g.key} style={styles.workoutExBlock}>
                <PressableScale style={styles.workoutExHeader} onPress={() => toggleGroup(g.key)}>
                  <View style={[styles.workoutExBadge, active && styles.workoutExBadgeActive]}>
                    <Text style={[styles.workoutExBadgeText, active && styles.workoutExBadgeTextActive]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.workoutExTitle} numberOfLines={1}>{g.exercise}</Text>
                  <Text style={styles.workoutExMeta}>{done}/{g.sets.length} 组{active ? ' · 进行中' : ''}</Text>
                  <Text style={styles.workoutExChevron}>{expanded ? '▾' : '▸'}</Text>
                </PressableScale>
                {expanded && (
                  <>
                    <View style={styles.setHeader}>
                      <Text style={{ flex: 1, fontSize: 13, color: Colors.textMuted }}>组次</Text>
                      {g.type === 'weighted' && <Text style={{ width: 68, fontSize: 13, color: Colors.textMuted }}>重量</Text>}
                      <Text style={{ width: 68, fontSize: 13, color: Colors.textMuted }}>{g.type === 'cardio' ? '分钟' : '次数'}</Text>
                      <Text style={{ width: 56, fontSize: 13, color: Colors.textMuted, textAlign: 'center' }}>完成</Text>
                    </View>
                    {g.sets.map(s => (
                      <View key={s.id} style={styles.setRow}>
                        <Text style={{ flex: 1, fontSize: 13, color: Colors.textSecondary }}>第 {s.setNumber} 组</Text>
                        {g.type === 'weighted' && (
                          <TextInput style={styles.setInput} value={String(s.weight)} onChangeText={t => updateSet(s.id, 'weight', Number(t))} keyboardType="number-pad" />
                        )}
                        <TextInput style={styles.setInput} value={String(s.reps)} onChangeText={t => updateSet(s.id, 'reps', Number(t))} keyboardType="number-pad" />
                        <PressableScale
                          style={[styles.toggleBtn, s.completed && styles.toggleBtnDone]}
                          onPress={() => updateSet(s.id, 'completed', true)}
                        >
                          <Text style={[styles.toggleBtnText, s.completed && styles.toggleBtnTextDone]}>
                            {s.completed ? '已做' : '待做'}
                          </Text>
                        </PressableScale>
                      </View>
                    ))}
                  </>
                )}
              </View>
            );
          })}
          <PressableScale style={[styles.primaryBtn, { marginTop: Spacing.lg }]} onPress={handleFinish}>
            <Text style={styles.primaryBtnText}>结束训练并结算</Text>
          </PressableScale>
          <PressableScale style={[styles.outlineBtn, { marginTop: Spacing.sm }]} onPress={handleClose}>
            <Text style={styles.outlineBtnText}>取消训练</Text>
          </PressableScale>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, marginBottom: Spacing.lg, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTitle: { ...Typography.title, marginBottom: 4 },
  cardSub: { ...Typography.caption, marginBottom: Spacing.lg },
  emptyText: { ...Typography.caption, fontStyle: 'italic', textAlign: 'center', paddingVertical: Spacing.lg },

  // Workout summary
  workoutSummary: { gap: 8, paddingTop: Spacing.xs },
  workoutName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.2 },
  workoutMeta: { fontSize: 13, color: Colors.textMuted },

  // Plan cards
  planCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md,
    gap: Spacing.md, ...Shadow.card,
  },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.accentLight, justifyContent: 'center', alignItems: 'center' },
  planIconText: { fontSize: 17, fontWeight: '700', color: Colors.accent },
  planBody: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.2 },
  planMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  planPreview: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  planPreviewText: { fontSize: 12, color: Colors.textSecondary },
  planFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planFooterLeft: { flexDirection: 'row', gap: 6 },
  planGhostBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceHover },
  planGhostText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  planStartBtn: {
    backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: BorderRadius.md, ...Shadow.button,
  },
  planStartText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  planEmpty: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 6 },
  planEmptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  planEmptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  newPlanBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border,
    paddingVertical: 14, borderRadius: BorderRadius.lg, alignItems: 'center',
    backgroundColor: Colors.surface, marginTop: Spacing.xs,
  },
  newPlanBtnText: { fontSize: 15, fontWeight: '600', color: Colors.accent },

  // Buttons
  primaryBtn: {
    backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: BorderRadius.lg,
    alignItems: 'center', ...Shadow.button,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceHover },
  ghostBtnText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  outlineBtn: {
    borderWidth: 1, borderColor: Colors.border, paddingVertical: 14,
    borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.md,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  miniBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surfaceHover,
  },
  miniBtnText: { fontSize: 12, fontWeight: '500', color: Colors.textSecondary },
  miniBtnDisabled: { opacity: 0.4 },

  // Toggle
  toggleBtn: {
    width: 56, paddingVertical: 5, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceHover, alignItems: 'center',
  },
  toggleBtnDone: { backgroundColor: Colors.accentLight },
  toggleBtnText: { fontSize: 12, fontWeight: '500', color: Colors.textMuted },
  toggleBtnTextDone: { color: Colors.accent },
  deleteText: { fontSize: 12, fontWeight: '500', color: Colors.danger },

  // Modal chrome
  modalIconBtn: { padding: 4 },
  timerBadge: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  timerDisplay: { fontSize: 14, fontWeight: '700', color: Colors.accent, fontVariant: ['tabular-nums'] as any },

  // Forms
  formLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
  formLabelGap: { marginTop: Spacing.md },
  formHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: 15, color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },

  // Plan editor layout
  modalBodyContent: { padding: Spacing.lg, paddingBottom: 48, gap: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  formCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  durationInput: { flex: 1, maxWidth: 120, textAlign: 'center' },
  durationUnit: { fontSize: 14, color: Colors.textMuted },

  // Exercise editor
  exerciseBlock: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  exBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  exNameInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, fontWeight: '600',
    color: Colors.textPrimary, backgroundColor: Colors.surfaceHover,
  },
  exHeaderActions: { flexDirection: 'row', gap: 6 },

  // Type options
  typeGrid: { flexDirection: 'row', gap: 8 },
  typeOption: {
    flex: 1, padding: Spacing.sm, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surface, gap: 4,
  },
  typeOptionActive: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  typeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  typeLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  typeLabelActive: { color: Colors.accent },
  typeCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  typeCheckText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  advToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12, marginTop: Spacing.xs,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceHover,
  },
  advToggleText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  advToggleIcon: { fontSize: 16, fontWeight: '600', color: Colors.textMuted },
  metRow: { flexDirection: 'row', gap: 10 },

  // Sets
  setsCard: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingBottom: 6 },
  setHeaderCol: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  setIndex: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  setInput: {
    width: 68, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    paddingVertical: 7, paddingHorizontal: 4, fontSize: 13, textAlign: 'center',
    color: Colors.textPrimary, backgroundColor: Colors.surface,
  },
  setDelBtn: {
    width: 40, height: 34, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.borderLight,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface,
  },
  setDelText: { fontSize: 12, fontWeight: '600', color: Colors.danger },
  addSetBtn: {
    marginTop: 6, paddingVertical: 8, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border,
    alignItems: 'center', backgroundColor: Colors.surface,
  },
  addSetText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  removeExBtn: {
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.borderLight, alignItems: 'center',
  },
  removeExText: { fontSize: 13, fontWeight: '500', color: Colors.danger },
  addExBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border,
    paddingVertical: 14, borderRadius: BorderRadius.lg, alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  addExText: { fontSize: 15, fontWeight: '600', color: Colors.accent },

  // Workout execution
  workoutExBlock: { marginBottom: Spacing.xl },
  workoutExHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  workoutExBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  workoutExBadgeActive: { backgroundColor: Colors.accentLight },
  workoutExBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  workoutExBadgeTextActive: { color: Colors.accent },
  workoutExTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.2 },
  workoutExMeta: { fontSize: 12, color: Colors.textMuted, fontVariant: ['tabular-nums'] as any },
  workoutExChevron: { fontSize: 14, color: Colors.textMuted },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: (StatusBar.currentHeight ?? 0) + Spacing.md, paddingBottom: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  modalBack: { fontSize: 20, color: Colors.accent },
  modalTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  modalSave: { fontSize: 15, fontWeight: '600', color: Colors.accent },
  modalBody: { flex: 1, padding: Spacing.lg },
});
