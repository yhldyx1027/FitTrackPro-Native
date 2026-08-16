// ============================================================
// FitTrack Pro - Dashboard Screen
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, ScrollView,
  StyleSheet,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { Calc, toR, GOAL_LABELS } from '../utils/calculations';
import PressableScale from '../components/PressableScale';

const TICK_R_OUTER = 186;    // watch-face tick ring (outer edge)
const TICK_R_INNER = 178;    // watch-face tick ring (inner edge)
const ARC_START = 135;       // arcs start at bottom-left
const ARC_SWEEP = 270;       // each arc spans 270 deg, gap at the bottom like a watch
const RING_SIZE = (TICK_R_OUTER + 2) * 2 + 4;  // ~380, add small padding
const CENTER = RING_SIZE / 2;

// Point on a circle, angle in degrees (SVG y-down: 0 = 3 o'clock, clockwise)
function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

// 270-deg track arc (gap at the bottom)
function arcTrackD(r: number) {
  const s = polar(r, ARC_START);
  const e = polar(r, ARC_START + ARC_SWEEP);
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${r} ${r} 0 1 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// Progress arc from the start, sweeping clockwise by progress*270 deg
function arcProgressD(r: number, progress: number) {
  if (progress <= 0) return null;
  const sweep = ARC_SWEEP * Math.min(progress, 1);
  const s = polar(r, ARC_START);
  const e = polar(r, ARC_START + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// 60 watch ticks (every 5th longer) as a single path
const TICKS_PATH = (() => {
  const segs: string[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 * Math.PI) / 180;
    const r2 = i % 5 === 0 ? TICK_R_OUTER : TICK_R_OUTER - 4;
    const x1 = CENTER + TICK_R_INNER * Math.cos(a);
    const y1 = CENTER + TICK_R_INNER * Math.sin(a);
    const x2 = CENTER + r2 * Math.cos(a);
    const y2 = CENTER + r2 * Math.sin(a);
    segs.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return segs.join('');
})();

// ---- Ring Data ----
const ringColors = {
  intake: '#dc6b2f',
  carb: '#2f6c8f',
  fat: '#dc9b3f',
  protein: '#c8476c',
};

const ringConfigs: { key: keyof typeof ringColors; label: string; r: number; sw: number }[] = [
  // sw = 25, gap between rings = 5
  // outer edges: 175.5 / 145.5 / 115.5 / 85.5, innermost inner edge = 60.5
  { key: 'intake', label: '卡路里摄入', r: 163, sw: 25 },
  { key: 'carb', label: '碳水', r: 133, sw: 25 },
  { key: 'fat', label: '脂肪', r: 103, sw: 25 },
  { key: 'protein', label: '蛋白质', r: 73, sw: 25 },
];

// ---- Component ----

export default function DashboardScreen({ navigation }: any) {
  const app = useApp();
  if (!app.ready) return <LoadingView />;

  const { profile, todayTrainingLogs, todayDietEntries, isTrainingDay, trainingCal, trainingVol, todayWorkout } = app;
  const m = Calc.buildDashboardMetrics(profile, todayTrainingLogs[todayTrainingLogs.length - 1] ?? null, todayDietEntries, isTrainingDay, trainingCal);
  const p = profile;

  const ringValues = {
    intake: { current: m.consumedCalories, target: m.recommendedCalories },
    carb: { current: m.consumedCarbs, target: m.targetMacros.carbs },
    fat: { current: m.consumedFat, target: m.targetMacros.fat },
    protein: { current: m.consumedProtein, target: m.targetMacros.protein },
  };

  const missingFields = [p.height, p.weight, p.age, p.gender, p.goal, p.activityFactor].filter(v => v == null).length;
  const hasProfile = missingFields === 0;

  const quickActions = [];
  if (missingFields > 0) quickActions.push({ t: '完善身体数据', d: `还差 ${missingFields} 项`, tab: 'SettingsPage', color: Colors.dotPurple });
  if (!todayWorkout && todayTrainingLogs.length === 0) quickActions.push({ t: '开始今日训练', d: '从计划库开始', tab: 'TrainingPage', color: Colors.dotOrange });
  if (todayDietEntries.length === 0) quickActions.push({ t: '记录第一餐', d: '热量和营养实时更新', tab: 'DietPage', color: Colors.dotBlue });
  quickActions.push({ t: '回看记录', d: '训练和饮食按日合并', tab: 'HistoryPage', color: Colors.dotGreen });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Rings */}
      <View style={styles.ringsContainer}>
        <View style={styles.ringsSvgWrapper}>
          <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            {/* Watch-face minute ticks (dashed circle ≈ 60 marks) */}
            <Path d={TICKS_PATH} stroke="#d8d4cd" strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
            {ringConfigs.map(c => {
              const progress = ringValues[c.key].target > 0
                ? Math.min(ringValues[c.key].current / ringValues[c.key].target, 1)
                : 0;
              const progD = arcProgressD(c.r, progress);
              return (
                <G key={c.key}>
                  <Path d={arcTrackD(c.r)} stroke="#eceae5" strokeWidth={c.sw} fill="none" strokeLinecap="round" />
                  {progD && <Path d={progD} stroke={ringColors[c.key]} strokeWidth={c.sw} fill="none" strokeLinecap="round" />}
                </G>
              );
            })}
          </Svg>
          <View style={styles.ringsCenter}>
            <Text style={styles.ringsCenterLabel}>实际摄入</Text>
            <View style={styles.ringsCenterValueRow}>
              <Text style={styles.ringsPercent}>{toR(m.consumedCalories)}</Text>
              <Text style={styles.ringsUnit}>千卡</Text>
            </View>
            <Text style={styles.ringsCenterTarget}>目标 {toR(m.recommendedCalories)}</Text>
          </View>
        </View>
        <View style={styles.legendGrid}>
          {ringConfigs.map(c => (
            <View key={c.key} style={styles.legendChip}>
              <View style={[styles.legendDot, { backgroundColor: ringColors[c.key] }]} />
              <Text style={styles.legendLabel}>{c.label}</Text>
              <Text style={styles.legendValue}>
                {toR(ringValues[c.key].current)}/{toR(ringValues[c.key].target)}
              </Text>
            </View>
          ))}
        </View>

        {/* Today's training burn - shown below the rings, not as a ring */}
        <View style={styles.burnPill}>
          <View style={styles.burnPillDot} />
          <Text style={styles.burnPillLabel}>今日训练消耗</Text>
          <Text style={styles.burnPillValue}>{toR(trainingCal)} 千卡</Text>
        </View>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={[styles.badge, { backgroundColor: isTrainingDay ? Colors.accentLight : Colors.surfaceHover }]}>
            <Text style={[styles.badgeText, { color: isTrainingDay ? Colors.accent : Colors.textSecondary }]}>
              {isTrainingDay ? '训练日' : '休息日'}
            </Text>
          </View>
          <Text style={styles.heroGoal}>当前目标：{profile.goal ? GOAL_LABELS[profile.goal] : '未设置'}</Text>
        </View>
        <Text style={styles.heroCalories}>{toR(m.recommendedCalories)} 千卡</Text>
        <Text style={styles.heroDesc}>
          {hasProfile
            ? '今天把摄入、消耗和三大营养素尽量都闭环。'
            : '身体数据和目标还没填完整，当前热量建议会先显示为 0。'}
        </Text>
      </View>

      {/* Stat Cards */}
      <View style={styles.statRow}>
        <StatCard label="基础代谢" value={`${toR(m.bmr)} 千卡`} color={Colors.accent} fill={m.tdee > 0 ? Math.min(m.bmr / m.tdee, 1) : 0} />
        <StatCard label="全天消耗" value={`${toR(m.tdee)} 千卡`} color={Colors.warning} />
        <StatCard label="今日摄入" value={`${toR(m.consumedCalories)} 千卡`} color={Colors.info} fill={m.recommendedCalories > 0 ? Math.min(m.consumedCalories / m.recommendedCalories, 1) : 0} />
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>快捷入口</Text>
        <Text style={styles.cardSub}>现在最可能要做的事</Text>
        {quickActions.map((a, i) => (
          <PressableScale key={i} style={styles.quickAction} onPress={() => navigation.navigate(a.tab)}>
            <View style={[styles.quickDot, { backgroundColor: a.color }]} />
            <View style={styles.quickBody}>
              <Text style={styles.quickTitle}>{a.t}</Text>
              <Text style={styles.quickDetail}>{a.d}</Text>
            </View>
            <Text style={styles.quickArrow}>→</Text>
          </PressableScale>
        ))}
      </View>

      {/* Nutrition Progress */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>营养进度</Text>
        <Text style={styles.cardSub}>训练日按 5:3:2 分配，休息日按 4:3:3</Text>
        <ProgressBar label="总热量" current={m.consumedCalories} target={m.recommendedCalories} color="#dc6b2f" showPercent />
        <ProgressBar label="碳水（克）" current={m.consumedCarbs} target={m.targetMacros.carbs} color="#2f6c8f" />
        <ProgressBar label="蛋白质（克）" current={m.consumedProtein} target={m.targetMacros.protein} color="#1f8a70" />
        <ProgressBar label="脂肪（克）" current={m.consumedFat} target={m.targetMacros.fat} color="#dc6b2f" />
      </View>

      {/* Training Snapshot */}
      <View style={styles.card}>
        <View style={[styles.accentBar, { backgroundColor: Colors.warning }]} />
        <View style={{ flex: 1, paddingRight: Spacing.lg }}>
          <Text style={styles.cardTitle}>训练快照</Text>
          <Text style={styles.cardSub}>容量按重量乘次数累计，热量按 MET 公式叠加强度修正</Text>
          <SnapshotRow label="当前计划" value={todayTrainingLogs.map(l => l.planUsed).join('、') || todayWorkout?.sourcePlanName || '尚未开始记录'} />
          <SnapshotRow label="训练容量" value={`${toR(trainingVol)}`} />
          <SnapshotRow label="预计消耗" value={`${toR(trainingCal)} 千卡`} />
        </View>
      </View>
    </ScrollView>
  );
}

// ---- Sub-components ----

function LoadingView() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>正在整理你的训练台</Text>
    </View>
  );
}

function StatCard({ label, value, color, fill = 0 }: { label: string; value: string; color: string; fill?: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${fill * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ProgressBar({ label, current, target, color, showPercent }: { label: string; current: number; target: number; color: string; showPercent?: boolean }) {
  const pct = target <= 0 ? 0 : Math.min(current / target, 1);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>
          {toR(current)}/{toR(target)}{showPercent ? `（${toR(pct * 100)}%）` : ''}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.snapshotRow}>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue}>{value}</Text>
    </View>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { ...Typography.body, color: Colors.textMuted },

  // Rings
  ringsContainer: { alignItems: 'center', marginBottom: Spacing.xxl },
  ringsSvgWrapper: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringsCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringsCenterLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
  ringsCenterValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  ringsPercent: { fontSize: 36, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -1, fontVariant: ['tabular-nums'] as any },
  ringsUnit: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  ringsCenterTarget: { fontSize: 12, color: Colors.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] as any },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.lg, width: '100%' },
  legendChip: {
    flexBasis: '48%', flexGrow: 1,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendLabel: { flex: 1, fontSize: 13, color: Colors.textMuted },
  legendValue: { ...Typography.tabularNumber, fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  burnPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.lg,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 9,
  },
  burnPillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  burnPillLabel: { fontSize: 13, fontWeight: '500', color: Colors.textMuted },
  burnPillValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] as any },

  // Hero
  hero: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, marginBottom: Spacing.lg, ...Shadow.elevated,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.lg },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.sm },
  badgeText: { fontSize: 12, fontWeight: '600' },
  heroGoal: { fontSize: 13, color: Colors.textMuted },
  heroCalories: { ...Typography.metricLarge, marginBottom: Spacing.sm },
  heroDesc: { ...Typography.caption, maxWidth: '80%' },

  // Stats
  statRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  statLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  statTrack: { height: 3, backgroundColor: Colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  statFill: { height: '100%', borderRadius: 2 },

  // Cards
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, marginBottom: Spacing.lg, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTitle: { ...Typography.title, marginBottom: 4 },
  cardSub: { ...Typography.caption, marginBottom: Spacing.lg },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: BorderRadius.xxl, borderBottomLeftRadius: BorderRadius.xxl },

  // Quick Actions
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  quickDot: { width: 10, height: 10, borderRadius: 5 },
  quickBody: { flex: 1 },
  quickTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  quickDetail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  quickArrow: { fontSize: 16, color: Colors.textMuted },

  // Progress
  progressRow: { marginBottom: 14 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, color: Colors.textSecondary },
  progressValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, fontVariant: ['tabular-nums'] as any },
  progressTrack: { height: 6, backgroundColor: Colors.borderLight, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Snapshot
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  snapshotLabel: { fontSize: 13, color: Colors.textMuted },
  snapshotValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
});
