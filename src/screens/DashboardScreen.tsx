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
import { Calc, toR } from '../utils/calculations';
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

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const now = new Date();
  const dateLine = `${now.getMonth() + 1}月${now.getDate()}日 ${['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]} · ${isTrainingDay ? '训练日' : '休息日'}`;

  // Quick action cards (3 across, mirroring the design board)
  const quickActionCards = [
    {
      t: '训练',
      d: todayWorkout ? '继续训练' : todayTrainingLogs.length > 0 ? '再练一次' : '从计划库开始',
      tab: 'TrainingPage',
      color: Colors.dotGreen,
    },
    {
      t: '饮食',
      d: todayDietEntries.length > 0 ? '继续记录' : '记录三餐',
      tab: 'DietPage',
      color: Colors.dotOrange,
    },
    {
      t: 'AI 助手',
      d: '饮食问答',
      tab: 'AiChatPage',
      color: Colors.dotPurple,
    },
  ];

  // AI banner tip, personalized from today's state
  const remaining = Math.max(m.recommendedCalories - m.consumedCalories, 0);
  const aiTip = !hasProfile
    ? '完善身体数据后，我能给出更准的建议'
    : m.consumedCalories > m.recommendedCalories
      ? `今日已超 ${toR(m.consumedCalories - m.recommendedCalories)} 千卡，晚餐建议清淡些`
      : todayDietEntries.length === 0
        ? '还没记录饮食，问我热量和搭配吧'
        : `还剩约 ${toR(remaining)} 千卡，想知道怎么吃最合适？`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Greeting */}
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.greetingSub}>{dateLine}</Text>

      {/* Watch-face ring card */}
      <View style={styles.ringCard}>
        <View style={styles.ringsSvgWrapper}>
          <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            {/* Watch-face minute ticks */}
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
            <Text style={styles.ringsCenterTarget}>目标 {toR(m.recommendedCalories)} kcal</Text>
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

        {/* Today's training burn */}
        <View style={styles.burnPill}>
          <View style={styles.burnPillDot} />
          <Text style={styles.burnPillLabel}>今日训练消耗</Text>
          <Text style={styles.burnPillValue}>{toR(trainingCal)} 千卡</Text>
        </View>
      </View>

      {/* Quick action cards */}
      <View style={styles.quickCardsRow}>
        {quickActionCards.map((a, i) => (
          <PressableScale key={i} style={styles.quickCard} onPress={() => navigation.navigate(a.tab)}>
            <View style={[styles.quickCardDot, { backgroundColor: a.color }]} />
            <Text style={styles.quickCardTitle}>{a.t}</Text>
            <Text style={styles.quickCardSub}>{a.d}</Text>
          </PressableScale>
        ))}
      </View>

      {/* AI assistant banner */}
      <PressableScale style={styles.aiBanner} onPress={() => navigation.navigate('AiChatPage')}>
        <View style={styles.aiBannerAccent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.aiBannerTitle}>AI 饮食助手</Text>
          <Text style={styles.aiBannerTip} numberOfLines={1}>“{aiTip}”</Text>
        </View>
        <Text style={styles.aiBannerArrow}>›</Text>
      </PressableScale>
    </ScrollView>
  );
}

function LoadingView() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>正在整理你的训练台</Text>
    </View>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { ...Typography.body, color: Colors.textMuted },

  // Greeting
  greeting: { fontSize: 27, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.8, marginTop: Spacing.md },
  greetingSub: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg },

  // Watch-face ring card
  ringCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xl, marginBottom: Spacing.lg, ...Shadow.elevated,
    borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'center',
  },
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

  // Quick action cards
  quickCardsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
  quickCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.card,
  },
  quickCardDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 10 },
  quickCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  quickCardSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },

  // AI banner
  aiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  aiBannerAccent: { width: 6, borderRadius: 3, alignSelf: 'stretch', backgroundColor: Colors.dotPurple },
  aiBannerTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  aiBannerTip: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  aiBannerArrow: { fontSize: 22, color: Colors.textMuted, marginRight: 4 },
});
