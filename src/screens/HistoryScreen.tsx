// ============================================================
// FitTrack Pro - History Screen
// ============================================================

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { Calc, toR, getTodayKey } from '../utils/calculations';
import * as Storage from '../storage/storage';
import PressableScale from '../components/PressableScale';

const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function HistoryScreen() {
  const app = useApp();
  if (!app.ready) return null;

  const { historyTrainingLogs, historyDietLogs } = app;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build data map
  const dataMap = useMemo(() => {
    const map: Record<string, { tr: any; di: any }> = {};
    historyTrainingLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = { tr: null, di: null };
      map[l.date].tr = l;
    });
    historyDietLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = { tr: null, di: null };
      map[l.date].di = l;
    });
    return map;
  }, [historyTrainingLogs, historyDietLogs]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = getTodayKey();

  const shiftMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m); setYear(y); setSelectedDate(null);
  };

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const selectedData = selectedDate ? dataMap[selectedDate] : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
                onPress={() => setSelectedDate(ds)}
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
            {selectedData?.tr ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailTitle}>训练 · {selectedData.tr.planUsed}</Text>
                <Text style={styles.detailMeta}>
                  容量 {toR(selectedData.tr.volume)} · 消耗 {toR(selectedData.tr.calories)} 千卡 · {selectedData.tr.durationMinutes} 分钟
                </Text>
              </View>
            ) : (
              <Text style={styles.noData}>训练 · 无记录</Text>
            )}
            {selectedData?.di ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailTitle}>饮食 · 共 {selectedData.di.entries.length} 条</Text>
                <Text style={styles.detailMeta}>
                  摄入 {toR(Calc.dietTotals(selectedData.di.entries).calories)} 千卡 · 碳水 {toR(Calc.dietTotals(selectedData.di.entries).carbs)}g · 蛋白 {toR(Calc.dietTotals(selectedData.di.entries).protein)}g · 脂肪 {toR(Calc.dietTotals(selectedData.di.entries).fat)}g
                </Text>
              </View>
            ) : (
              <Text style={styles.noData}>饮食 · 无记录</Text>
            )}
          </View>
        )}
        {!selectedDate && <Text style={styles.selectHint}>点击日期查看详情</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },

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
});
