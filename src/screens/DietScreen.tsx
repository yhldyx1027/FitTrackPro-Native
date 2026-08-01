// ============================================================
// FitTrack Pro - Diet Screen
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput,
  StyleSheet, Modal, FlatList, StatusBar,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { Calc, toR, MEAL_LABELS, MEAL_TYPES, EMPTY_FOOD } from '../utils/calculations';
import { FoodItem, DietEntry, MealType } from '../types';
import PressableScale from '../components/PressableScale';

export default function DietScreen() {
  const app = useApp();
  if (!app.ready) return null;

  const { profile, todayTrainingLog, todayDietEntries, isTrainingDay, trainingCal, foodDb } = app;
  const m = Calc.buildDashboardMetrics(profile, todayTrainingLog, todayDietEntries, isTrainingDay, trainingCal);
  const totals = Calc.dietTotals(todayDietEntries);

  const [selectedMeal, setSelectedMeal] = useState<MealType>('breakfast');
  const [servings, setServings] = useState('1');
  const [foodEditorVisible, setFoodEditorVisible] = useState(false);
  const [msg, setMsg] = useState('');

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2400);
  };

  const handleAddFood = async (item: FoodItem) => {
    const entry: DietEntry = { ...item, servings: Number(servings) || 1, mealType: selectedMeal };
    await app.addDietEntry(entry);
    showMsg(`已添加到${MEAL_LABELS[selectedMeal]}`);
  };

  const handleRemoveEntry = async (index: number) => {
    await app.removeDietEntry(index);
    showMsg('已删除');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Banner */}
      {msg !== '' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{msg}</Text>
        </View>
      )}

      {/* Hero Tiles */}
      <View style={styles.heroRow}>
        <View style={[styles.heroTile, styles.heroDark]}>
          <Text style={styles.heroLabel}>建议摄入</Text>
          <Text style={[styles.heroValue, { color: '#fff' }]}>{toR(m.recommendedCalories)}</Text>
          <Text style={[styles.heroMeta, { color: 'rgba(255,255,255,0.6)' }]}>千卡 / 今天</Text>
        </View>
        <View style={styles.heroTile}>
          <Text style={styles.heroLabel}>已完成</Text>
          <Text style={styles.heroValue}>{toR(totals.calories)}</Text>
          <Text style={styles.heroMeta}>千卡 / 当前</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>摄入进度</Text>
        <Text style={styles.cardSub}>按训练/休息日方案实时更新</Text>
        <ProgressBar label="总热量" current={totals.calories} target={m.recommendedCalories} color="#dc6b2f" />
        <ProgressBar label="碳水（克）" current={totals.carbs} target={m.targetMacros.carbs} color="#2f6c8f" />
        <ProgressBar label="蛋白质（克）" current={totals.protein} target={m.targetMacros.protein} color="#1f8a70" />
        <ProgressBar label="脂肪（克）" current={totals.fat} target={m.targetMacros.fat} color="#dc6b2f" />
      </View>

      {/* Meal Selection & Food Search */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>记录餐次</Text>
        <Text style={styles.cardSub}>先选餐次和份数，再点食物旁的“添加”</Text>

        {/* Meal chips */}
        <View style={styles.chipRow}>
          {MEAL_TYPES.map(mt => (
            <PressableScale
              key={mt}
              style={[styles.chip, selectedMeal === mt && styles.chipActive]}
              onPress={() => setSelectedMeal(mt)}
            >
              <Text style={[styles.chipText, selectedMeal === mt && styles.chipTextActive]}>
                {MEAL_LABELS[mt]}
              </Text>
            </PressableScale>
          ))}
        </View>

        {/* Servings */}
        <Text style={styles.formLabel}>份数</Text>
        <TextInput style={[styles.input, { width: 100 }]} value={servings} onChangeText={setServings} keyboardType="decimal-pad" placeholder="1" />

        {/* Full food library */}
        <Text style={[styles.formLabel, { marginTop: Spacing.lg }]}>食物库</Text>
        {foodDb.length === 0 ? (
          <Text style={styles.dropdownEmpty}>食物库为空，先到“今日已吃”点“管理食物库”添加食物。</Text>
        ) : (
          foodDb.map((f, i) => (
            <View key={i} style={styles.foodRow}>
              <View style={{ flex: 1, paddingRight: Spacing.md }}>
                <Text style={styles.entryName}>{f.name}</Text>
                <Text style={styles.entryMeta}>{f.calories}千卡 | 碳{f.carbs} 蛋{f.protein} 脂{f.fat}</Text>
              </View>
              <PressableScale style={styles.addBtn} onPress={() => handleAddFood(f)}>
                <Text style={styles.addBtnText}>添加</Text>
              </PressableScale>
            </View>
          ))
        )}
      </View>

      {/* Today's Entries */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.cardTitle}>今日已吃</Text>
            <Text style={styles.cardSub}>按餐次分组查看</Text>
          </View>
          <PressableScale onPress={() => setFoodEditorVisible(true)}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.accent }}>管理食物库</Text>
          </PressableScale>
        </View>
        {todayDietEntries.length === 0 ? (
          <Text style={styles.emptyText}>今天还没有饮食记录。</Text>
        ) : (
          MEAL_TYPES.map(mt => {
            const entries = todayDietEntries.map((e, i) => ({ ...e, originalIndex: i })).filter(e => e.mealType === mt);
            if (entries.length === 0) return null;
            return (
              <View key={mt} style={styles.mealSection}>
                <Text style={styles.mealTitle}>{MEAL_LABELS[mt]}</Text>
                {entries.map((entry) => (
                  <View key={entry.originalIndex} style={styles.entryItem}>
                    <View style={styles.entryHeader}>
                      <Text style={styles.entryName}>{entry.name} × {entry.servings}</Text>
                      <PressableScale onPress={() => handleRemoveEntry(entry.originalIndex)}>
                        <Text style={styles.entryDelete}>删除</Text>
                      </PressableScale>
                    </View>
                    <Text style={styles.entryMeta}>
                      {toR(entry.calories * entry.servings)} 千卡 / 碳水 {toR(entry.carbs * entry.servings)} / 蛋白 {toR(entry.protein * entry.servings)} / 脂肪 {toR(entry.fat * entry.servings)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </View>

      {/* Food DB Editor Modal */}
      <FoodEditorModal visible={foodEditorVisible} onClose={() => setFoodEditorVisible(false)} />
    </ScrollView>
  );
}

// ---- Food Editor ----

function FoodEditorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useApp();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [editItem, setEditItem] = useState<FoodItem | null>(null);
  const [editing, setEditing] = useState(false);

  React.useEffect(() => {
    if (visible) setItems([...app.foodDb]);
  }, [visible]);

  const saveAll = async () => {
    await app.replaceFoodDb(items);
    onClose();
  };

  if (editing && editItem) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setEditing(false)} style={styles.modalIconBtn}><Text style={styles.modalBack}>←</Text></PressableScale>
            <Text style={styles.modalTitle}>{editItem.name || '新食物'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.formLabel}>名称</Text>
            <TextInput style={styles.input} value={editItem.name} onChangeText={t => setEditItem({ ...editItem, name: t })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>热量（千卡）</Text>
                <TextInput style={styles.input} value={String(editItem.calories)} onChangeText={t => setEditItem({ ...editItem, calories: Number(t) || 0 })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>碳水（克）</Text>
                <TextInput style={styles.input} value={String(editItem.carbs)} onChangeText={t => setEditItem({ ...editItem, carbs: Number(t) || 0 })} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>蛋白质（克）</Text>
                <TextInput style={styles.input} value={String(editItem.protein)} onChangeText={t => setEditItem({ ...editItem, protein: Number(t) || 0 })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>脂肪（克）</Text>
                <TextInput style={styles.input} value={String(editItem.fat)} onChangeText={t => setEditItem({ ...editItem, fat: Number(t) || 0 })} keyboardType="decimal-pad" />
              </View>
            </View>
            <PressableScale
              style={styles.primaryBtn}
              onPress={() => {
                if (!editItem.name.trim()) return;
                const idx = items.findIndex(f => f.name === (editItem as any)._origName);
                if (idx >= 0) {
                  const updated = [...items];
                  updated[idx] = { name: editItem.name, calories: editItem.calories, carbs: editItem.carbs, protein: editItem.protein, fat: editItem.fat };
                  setItems(updated);
                } else {
                  setItems([...items, { name: editItem.name, calories: editItem.calories, carbs: editItem.carbs, protein: editItem.protein, fat: editItem.fat }]);
                }
                setEditing(false);
              }}
            >
              <Text style={styles.primaryBtnText}>保存</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <PressableScale onPress={onClose} style={styles.modalIconBtn}><Text style={styles.modalBack}>←</Text></PressableScale>
          <Text style={styles.modalTitle}>食物库管理</Text>
          <PressableScale onPress={saveAll} style={styles.modalIconBtn}><Text style={styles.modalSave}>完成</Text></PressableScale>
        </View>
        <ScrollView style={styles.modalBody}>
          <PressableScale style={styles.outlineBtn} onPress={() => { setEditItem({ ...EMPTY_FOOD, name: '' }); setEditing(true); }}>
            <Text style={styles.outlineBtnText}>+ 新建食物</Text>
          </PressableScale>
          {items.map((f, i) => (
            <View key={i} style={styles.foodRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{f.name}</Text>
                <Text style={styles.entryMeta}>{f.calories}千卡 | 碳{f.carbs} 蛋{f.protein} 脂{f.fat}</Text>
              </View>
              <PressableScale onPress={() => { setEditItem({ ...f, _origName: f.name } as any); setEditing(true); }}>
                <Text style={{ fontSize: 12, color: Colors.accent }}>编辑</Text>
              </PressableScale>
              <PressableScale onPress={() => { setItems(items.filter((_, idx) => idx !== i)); }} style={{ marginLeft: 12 }}>
                <Text style={{ fontSize: 12, color: Colors.danger }}>删除</Text>
              </PressableScale>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---- Shared: Progress Bar ----

function ProgressBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target <= 0 ? 0 : Math.min(current / target, 1);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{toR(current)}/{toR(target)}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.section },

  banner: {
    backgroundColor: Colors.accentLight, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg, marginBottom: Spacing.lg,
  },
  bannerText: { fontSize: 14, fontWeight: '500', color: Colors.accent, textAlign: 'center' },

  heroRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.lg },
  heroTile: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.card,
  },
  heroDark: { backgroundColor: '#201d1a', borderColor: '#201d1a' },
  heroLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  heroValue: { fontSize: 34, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] as any, letterSpacing: -0.8 },
  heroMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl, marginBottom: Spacing.lg, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTitle: { ...Typography.title, marginBottom: 4 },
  cardSub: { ...Typography.caption, marginBottom: Spacing.lg },
  emptyText: { ...Typography.caption, fontStyle: 'italic', textAlign: 'center', paddingVertical: Spacing.lg },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  chip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22,
    backgroundColor: Colors.surfaceHover, borderWidth: 1, borderColor: Colors.borderLight,
  },
  chipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },

  modalIconBtn: { padding: 4 },

  formLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },

  dropdown: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    marginTop: 4, maxHeight: 200, overflow: 'hidden',
  },
  dropdownItem: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  dropdownName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  dropdownInfo: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  dropdownEmpty: { padding: Spacing.md, fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  mealSection: { marginTop: Spacing.xl },
  mealTitle: { fontSize: 14, fontWeight: '600', color: Colors.accent, marginBottom: Spacing.sm },
  entryItem: {
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  entryDelete: { fontSize: 12, color: Colors.danger },
  entryMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  foodRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  addBtn: {
    backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: BorderRadius.md, ...Shadow.button,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  progressRow: { marginBottom: 14 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, color: Colors.textSecondary },
  progressValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, fontVariant: ['tabular-nums'] as any },
  progressTrack: { height: 6, backgroundColor: Colors.borderLight, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Buttons
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
