// ============================================================
// FitTrack Pro - History Screen
// ============================================================

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Modal, Platform, Alert } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { Calc, toR, getTodayKey, MEAL_LABELS, MEAL_TYPES } from '../utils/calculations';
import * as Storage from '../storage/storage';
import PressableScale from '../components/PressableScale';
import { WorkoutSet, DietEntry, TrainingLog } from '../types';

const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

function groupSetsByExercise(sets: WorkoutSet[]) {
  const groups: { name: string; sets: WorkoutSet[] }[] = [];
  const map = new Map<string, WorkoutSet[]>();
  sets.forEach(s => {
    const key = s.exerciseId || s.exercise;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  });
  map.forEach(ss => groups.push({ name: ss[0]?.exercise || '动作', sets: ss }));
  return groups;
}

function formatSetLine(s: WorkoutSet): string {
  if (s.exerciseType === 'cardio') return `${s.reps} 分钟`;
  if (s.exerciseType === 'bodyweight') return `自重 × ${s.reps} 次`;
  return `${s.weight || 0}kg × ${s.reps} 次`;
}

export default function HistoryScreen() {
  const app = useApp();
  if (!app.ready) return null;

  const { historyTrainingLogs, historyDietLogs } = app;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // Build data map
  const dataMap = useMemo(() => {
    const map: Record<string, { trs: TrainingLog[]; di: any }> = {};
    historyTrainingLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = { trs: [], di: null };
      map[l.date].trs.push(l);
    });
    historyDietLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = { trs: [], di: null };
      map[l.date].di = l;
    });
    return map;
  }, [historyTrainingLogs, historyDietLogs]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = getTodayKey();
  const weekAgo = getTodayKey(new Date(Date.now() - 7 * 86400000));
  const last7Logs = historyTrainingLogs.filter(l => l.date >= weekAgo);
  const recentLogs = historyTrainingLogs.slice(0, 6);
  const weights = [...app.weightHistory].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);

  const DOT_COLORS = ['#1f8a70', '#2f6c8f', '#dc6b2f', '#7c5ce7', '#c8476c', '#dc9b3f'];

  // Weight trend chart geometry
  const chartW = 340, chartH = 110, padX = 14, padY = 14;
  const wMin = weights.length > 1 ? Math.min(...weights.map(w => w.weight)) : 0;
  const wMax = weights.length > 1 ? Math.max(...weights.map(w => w.weight)) : 0;
  const wSpan = Math.max(wMax - wMin, 0.5);
  const wPts = weights.map((w, i) => ({
    x: padX + (chartW - padX * 2) * (weights.length === 1 ? 0.5 : i / (weights.length - 1)),
    y: padY + (chartH - padY * 2) * (1 - (w.weight - wMin) / wSpan),
    ...w,
  }));

  const shiftMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m); setYear(y); setSelectedDate(null); setPreviewVisible(false);
  };

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const selectedData = selectedDate ? dataMap[selectedDate] : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.pageTitle}>历史记录</Text>
      <Text style={styles.pageSub}>
        近 7 天 · 训练 {last7Logs.length} 次 · 消耗 {toR(last7Logs.reduce((s, l) => s + (l.calories || 0), 0))} kcal
      </Text>

      <View style={styles.card}>
        {/* Month nav */}
        <View style={styles.monthNav}>
          <PressableScale onPress={() => shiftMonth(-1)} style={styles.navBtn}><Text style={styles.navArrow}>‹</Text></PressableScale>
          <Text style={styles.monthTitle}>{year}年{month}月</Text>
          <PressableScale onPress={() => shiftMonth(1)} style={styles.navBtn}><Text style={styles.navArrow}>›</Text></PressableScale>
        </View>

        {/* Day headers */}
        <View style={styles.dayHeaders}>
          {DAYS.map(d => <Text key={d} style={styles.dayHeader}>{d}</Text>)}
        </View>

        {/* Calendar grid */}
        <View style={styles.calGrid}>
          {calendarCells.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.calDay} />;
            const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const hasData = !!dataMap[ds];
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            return (
              <PressableScale
                key={ds}
                style={[styles.calDay, isToday && styles.calToday, hasData && styles.calHasData, isSelected && styles.calSelected]}
                onPress={() => { setSelectedDate(ds); setPreviewVisible(false); }}
              >
                <Text style={[styles.calDayText, isToday && styles.calTodayText, isSelected && styles.calSelectedText]}>
                  {d}
                </Text>
                {hasData && <View style={styles.calDot} />}
              </PressableScale>
            );
          })}
        </View>

        {/* Date detail */}
        {selectedDate && (
          <View style={styles.detail}>
            <Text style={styles.detailDate}>{selectedDate}</Text>
            {selectedData?.trs && selectedData.trs.length > 0 ? (
              <PressableScale style={styles.detailBlock} onPress={() => setPreviewVisible(true)}>
                <View style={styles.detailHeaderRow}>
                  <Text style={styles.detailTitle}>
                    训练 · {selectedData.trs.length > 1 ? `共 ${selectedData.trs.length} 次` : selectedData.trs[0].planUsed}
                  </Text>
                  <Text style={styles.detailChevron}>›</Text>
                </View>
                <Text style={styles.detailMeta}>
                  {selectedData.trs.map(l => l.planUsed).join('、')} · 总消耗 {toR(selectedData.trs.reduce((s, l) => s + (l.calories || 0), 0))} 千卡
                </Text>
              </PressableScale>
            ) : (
              <Text style={styles.noData}>训练 · 无记录</Text>
            )}
            {selectedData?.di ? (
              <PressableScale style={styles.detailBlock} onPress={() => setPreviewVisible(true)}>
                <View style={styles.detailHeaderRow}>
                  <Text style={styles.detailTitle}>饮食 · 共 {selectedData.di.entries.length} 条</Text>
                  <Text style={styles.detailChevron}>›</Text>
                </View>
                <Text style={styles.detailMeta}>
                  摄入 {toR(Calc.dietTotals(selectedData.di.entries).calories)} 千卡 · 碳水 {toR(Calc.dietTotals(selectedData.di.entries).carbs)}g · 蛋白 {toR(Calc.dietTotals(selectedData.di.entries).protein)}g · 脂肪 {toR(Calc.dietTotals(selectedData.di.entries).fat)}g
                </Text>
              </PressableScale>
            ) : (
              <Text style={styles.noData}>饮食 · 无记录</Text>
            )}
          </View>
        )}
        {!selectedDate && <Text style={styles.selectHint}>点击日期查看详情</Text>}
      </View>

      {/* Weight trend */}
      {weights.length > 1 && (
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>体重趋势</Text>
            <Text style={styles.sectionValue}>{weights[weights.length - 1].weight} kg</Text>
          </View>
          <Svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
            <Path
              d={`M${wPts.map(p => `${p.x},${p.y}`).join(' L')} L${wPts[wPts.length - 1].x},${chartH - padY} L${wPts[0].x},${chartH - padY} Z`}
              fill="#e5f2ed"
            />
            <Path
              d={`M${wPts.map(p => `${p.x},${p.y}`).join(' L')}`}
              stroke={Colors.accent}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {wPts.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={i === wPts.length - 1 ? 4 : 3} fill={i === wPts.length - 1 ? Colors.accent : Colors.surface} stroke={Colors.accent} strokeWidth={1.8} />
            ))}
          </Svg>
          <View style={styles.chartLabels}>
            {weights.map((w, i) => (
              <Text key={i} style={styles.chartLabel}>{w.date.slice(5).replace('-', '/')}</Text>
            ))}
          </View>
        </View>
      )}

      {/* Recent training records */}
      <Text style={styles.sectionTitle}>训练记录</Text>
      {recentLogs.length === 0 ? (
        <Text style={styles.noData}>还没有训练记录。</Text>
      ) : (
        recentLogs.map((log, i) => (
          <PressableScale
            key={log.id}
            style={styles.logCard}
            onPress={() => { setSelectedDate(log.date); setPreviewVisible(true); }}
          >
            <View style={[styles.logDot, { backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.logDay}>{log.date.slice(5).replace('-', '月')}日</Text>
              <Text style={styles.logName} numberOfLines={1}>{log.planUsed} · {log.sets.slice(0, 3).map(s => s.exercise).join(' / ')}</Text>
            </View>
            <Text style={styles.logKcal}>{toR(log.calories)} kcal</Text>
          </PressableScale>
        ))
      )}

      {/* Preview Modal */}
        <Modal
          visible={previewVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPreviewVisible(false)}
        >
          <View style={styles.preview}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.previewTitle}>{selectedDate} · 记录预览</Text>
                <Text style={styles.previewSub}>训练和饮食的完整明细</Text>
              </View>
              <PressableScale onPress={() => setPreviewVisible(false)} style={styles.previewCloseBtn}>
                <Text style={styles.previewCloseText}>关闭</Text>
              </PressableScale>
            </View>

            <ScrollView contentContainerStyle={styles.previewContent}>
              {selectedData?.trs && selectedData.trs.length > 0 && selectedData.trs.map(log => (
                <View key={log.id} style={styles.previewSection}>
                  <View style={styles.detailHeaderRow}>
                    <Text style={styles.previewSectionTitle}>训练 · {log.planUsed}</Text>
                    <PressableScale
                      onPress={() => {
                        Alert.alert('删除训练记录', `确定删除「${log.planUsed}」这条训练记录？`, [
                          { text: '取消', style: 'cancel' },
                          { text: '删除', style: 'destructive', onPress: () => app.deleteTrainingLog(log.id as string) },
                        ]);
                      }}
                      style={styles.previewDeleteBtn}
                    >
                      <Text style={styles.previewDeleteText}>删除</Text>
                    </PressableScale>
                  </View>
                  <Text style={styles.previewMeta}>
                    时长 {log.durationMinutes} 分钟 · 容量 {toR(log.volume)} · 消耗 {toR(log.calories)} 千卡
                  </Text>
                  {groupSetsByExercise(log.sets).map((g, i) => (
                    <View key={i} style={styles.previewGroup}>
                      <Text style={styles.previewGroupTitle}>{g.name}</Text>
                      {g.sets.map(s => (
                        <Text key={s.id} style={styles.previewGroupLine}>
                          第 {s.setNumber} 组 · {formatSetLine(s)}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ))}

              {selectedData?.di && (
                <View style={styles.previewSection}>
                  <Text style={styles.previewSectionTitle}>饮食 · 共 {selectedData.di.entries.length} 条</Text>
                  <Text style={styles.previewMeta}>
                    摄入 {toR(Calc.dietTotals(selectedData.di.entries).calories)} 千卡 · 碳水 {toR(Calc.dietTotals(selectedData.di.entries).carbs)}g · 蛋白 {toR(Calc.dietTotals(selectedData.di.entries).protein)}g · 脂肪 {toR(Calc.dietTotals(selectedData.di.entries).fat)}g
                  </Text>
                  {MEAL_TYPES.map(mt => {
                    const items = selectedData.di.entries.filter((e: DietEntry) => e.mealType === mt);
                    if (items.length === 0) return null;
                    return (
                      <View key={mt} style={styles.previewGroup}>
                        <Text style={styles.previewGroupTitle}>{MEAL_LABELS[mt]}</Text>
                        {items.map((e: DietEntry, i: number) => (
                          <Text key={i} style={styles.previewGroupLine}>
                            {e.name} × {e.servings} · {toR(e.calories * e.servings)}千卡 · 碳{toR(e.carbs * e.servings)} 蛋{toR(e.protein * e.servings)} 脂{toR(e.fat * e.servings)}
                          </Text>
                        ))}
                      </View>
                    );
                  })}
                </View>
              )}

              {(!selectedData?.trs || selectedData.trs.length === 0) && !selectedData?.di && (
                <Text style={styles.previewEmpty}>这一天没有训练或饮食记录。</Text>
              )}
            </ScrollView>
          </View>
        </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },

  pageTitle: { fontSize: 27, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.8, marginTop: Spacing.md, marginBottom: 4 },
  pageSub: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.lg },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.3, marginBottom: Spacing.sm },
  sectionValue: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartLabel: { fontSize: 9.5, color: Colors.textMuted },

  logCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  logDot: { width: 12, height: 12, borderRadius: 6 },
  logDay: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  logName: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  logKcal: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },

  monthNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  navBtn: { padding: 6 },
  navArrow: { fontSize: 24, color: Colors.accent, paddingHorizontal: 8, lineHeight: 26 },
  monthTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },

  dayHeaders: { flexDirection: 'row', marginBottom: Spacing.sm },
  dayHeader: {
    flex: 1, textAlign: 'center', fontSize: 13, color: Colors.textMuted,
    paddingVertical: 4,
  },

  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  calDayText: { fontSize: 14, color: Colors.textPrimary, fontVariant: ['tabular-nums'] as any },
  calToday: { backgroundColor: Colors.accentLight },
  calTodayText: { fontWeight: '700', color: Colors.accent },
  calHasData: {},
  calDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent, marginTop: 3 },
  calSelected: { backgroundColor: Colors.accent },
  calSelectedText: { color: '#fff', fontWeight: '600' },

  selectHint: { textAlign: 'center', fontSize: 13, color: Colors.textMuted, marginTop: Spacing.xl },

  detail: {
    marginTop: Spacing.xl, paddingTop: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  detailDate: { fontSize: 15, fontWeight: '600', color: Colors.accent, marginBottom: Spacing.md },
  detailBlock: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  detailTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  detailMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  noData: { fontSize: 13, color: Colors.textMuted, paddingVertical: 6 },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailChevron: { fontSize: 20, color: Colors.textMuted, marginLeft: 8 },

  // Preview modal
  preview: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? 48 : 16 },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  previewTitle: { fontSize: 19, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.3 },
  previewSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  previewCloseBtn: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  previewCloseText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  previewContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.section },
  previewSection: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.card,
  },
  previewSectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  previewMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.md },
  previewDeleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  previewDeleteText: { fontSize: 12, fontWeight: '500', color: Colors.danger },
  previewGroup: {
    backgroundColor: Colors.surfaceHover, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  previewGroupTitle: { fontSize: 13, fontWeight: '600', color: Colors.accent, marginBottom: 4 },
  previewGroupLine: { fontSize: 13, color: Colors.textSecondary, lineHeight: 21 },
  previewEmpty: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.xxxl },
});
