// ============================================================
// FitTrack Pro - Storage Layer (AsyncStorage 3.x)
// Migrated from storage.js
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Profile, TrainingPlan, Workout, TrainingLog, FoodItem,
  DietEntry, DietLog, WeightRecord,
} from '../types';

const PREFIX = 'fittrack-pro:';

function key(path: string): string {
  return PREFIX + path;
}

// ---- Profile ----

export async function loadProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(key('profile.json'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(key('profile.json'), JSON.stringify(profile));
}

// ---- Training Plans ----

export async function loadPlans(): Promise<TrainingPlan[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const planKeys = allKeys.filter(k => k.startsWith(key('plans/')));
    const entries = await AsyncStorage.getMany(planKeys);
    return planKeys
      .map(k => {
        const v = entries[k];
        return v ? JSON.parse(v) : null;
      })
      .filter((v): v is TrainingPlan => v !== null)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch { return []; }
}

export async function savePlan(plan: TrainingPlan): Promise<void> {
  await AsyncStorage.setItem(key('plans/' + plan.id + '.json'), JSON.stringify(plan));
}

export async function deletePlan(planId: string): Promise<void> {
  await AsyncStorage.removeItem(key('plans/' + planId + '.json'));
}

// ---- Current Workout ----

export async function loadCurrentWorkout(date: string): Promise<Workout | null> {
  try {
    const raw = await AsyncStorage.getItem(key('current_workouts/' + date + '.json'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveCurrentWorkout(workout: Workout): Promise<void> {
  await AsyncStorage.setItem(key('current_workouts/' + workout.date + '.json'), JSON.stringify(workout));
}

export async function deleteCurrentWorkout(date: string): Promise<void> {
  await AsyncStorage.removeItem(key('current_workouts/' + date + '.json'));
}

// ---- Training Logs ----

/**
 * A day can hold MULTIPLE completed training logs. They are stored as an
 * array under `training_logs/<date>.json`; the old single-object format is
 * migrated automatically on read. Each log gets a stable id when missing.
 */
export async function loadTrainingLogsByDate(date: string): Promise<TrainingLog[]> {
  try {
    const raw = await AsyncStorage.getItem(key('training_logs/' + date + '.json'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list: TrainingLog[] = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((l, i) => ({ ...l, id: l.id || `${date}-${i}` }));
  } catch { return []; }
}

export async function saveTrainingLogsByDate(date: string, logs: TrainingLog[]): Promise<void> {
  await AsyncStorage.setItem(key('training_logs/' + date + '.json'), JSON.stringify(logs));
}

export async function saveTrainingLog(log: TrainingLog): Promise<void> {
  const logs = await loadTrainingLogsByDate(log.date);
  const idx = logs.findIndex(l => l.id === log.id);
  if (idx >= 0) logs[idx] = log; else logs.push(log);
  await saveTrainingLogsByDate(log.date, logs);
}

export async function deleteTrainingLogByDate(date: string, logId: string): Promise<void> {
  const logs = await loadTrainingLogsByDate(date);
  const next = logs.filter(l => l.id !== logId);
  await saveTrainingLogsByDate(date, next);
}

export async function loadTrainingLogs(): Promise<TrainingLog[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const logKeys = allKeys.filter(k => k.startsWith(key('training_logs/')));
    const entries = await AsyncStorage.getMany(logKeys);
    const logs: TrainingLog[] = [];
    for (const k of logKeys) {
      const v = entries[k];
      if (!v) continue;
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) logs.push(...parsed);
        else logs.push(parsed);
      } catch { /* skip corrupt entry */ }
    }
    return logs
      .map(l => ({ ...l, id: l.id || `${l.date}-${Math.random().toString(36).slice(2, 8)}` }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}

// ---- Food Database ----

export async function loadFoodDb(): Promise<FoodItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key('food_db'));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveFoodDb(items: FoodItem[]): Promise<void> {
  await AsyncStorage.setItem(key('food_db'), JSON.stringify(items));
}

// ---- Diet Entries ----

export async function loadDietEntries(date: string): Promise<DietEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(key('diet_logs/' + date));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveDietEntries(date: string, entries: DietEntry[]): Promise<void> {
  await AsyncStorage.setItem(key('diet_logs/' + date), JSON.stringify(entries));
}

export async function loadDietHistoryLogs(): Promise<DietLog[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const dietKeys = allKeys.filter(k => k.startsWith(key('diet_logs/')));
    const entries = await AsyncStorage.getMany(dietKeys);
    return dietKeys
      .map(k => {
        const date = k.replace(key('diet_logs/'), '');
        const v = entries[k];
        const parsed = v ? JSON.parse(v) : [];
        return { date, entries: parsed };
      })
      .filter(log => log.entries.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}

// ---- Weight Logs ----

export async function saveWeight(date: string, weight: number): Promise<void> {
  await AsyncStorage.setItem(key('weight_logs/' + date), JSON.stringify({ date, weight }));
}

export async function loadWeight(date: string): Promise<WeightRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(key('weight_logs/' + date));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function getLastWeight(): Promise<number | null> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const weightKeys = allKeys
      .filter(k => k.startsWith(key('weight_logs/')))
      .sort()
      .reverse();
    for (const k of weightKeys) {
      const raw = await AsyncStorage.getItem(k);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.weight != null) return data.weight;
      }
    }
    return null;
  } catch { return null; }
}

export async function loadWeightHistory(): Promise<WeightRecord[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const weightKeys = allKeys
      .filter(k => k.startsWith(key('weight_logs/')))
      .sort();
    const records: WeightRecord[] = [];
    for (const k of weightKeys) {
      const raw = await AsyncStorage.getItem(k);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.date && data.weight != null) {
          records.push({ date: data.date, weight: data.weight });
        }
      }
    }
    return records;
  } catch { return []; }
}

// ---- AI Settings ----

export interface AiSettings {
  apiKey: string;
  model: string;
}

export async function loadAiSettings(): Promise<AiSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(key('ai_settings'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await AsyncStorage.setItem(key('ai_settings'), JSON.stringify(settings));
}

// ---- AI Conversations ----

export interface AiConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface AiConversation {
  id: string;
  mode: 'diet' | 'training';
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiConversationMessage[];
}

export const MAX_AI_CONVERSATIONS = 5;

export async function loadAiConversations(mode: 'diet' | 'training'): Promise<AiConversation[]> {
  try {
    const raw = await AsyncStorage.getItem(key('ai_conversations_' + mode));
    const list: AiConversation[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export async function saveAiConversations(
  mode: 'diet' | 'training',
  conversations: AiConversation[]
): Promise<void> {
  // Merge with what's already persisted so a stale in-memory list can never
  // silently drop conversations (incoming entries win by id).
  const existing = await loadAiConversations(mode);
  const byId = new Map<string, AiConversation>();
  for (const c of existing) byId.set(c.id, c);
  for (const c of conversations) byId.set(c.id, c);

  // Keep at most the most recent MAX_AI_CONVERSATIONS (by updatedAt).
  const trimmed = Array.from(byId.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_AI_CONVERSATIONS);
  await AsyncStorage.setItem(key('ai_conversations_' + mode), JSON.stringify(trimmed));
}

export async function deleteAiConversation(
  mode: 'diet' | 'training',
  conversationId: string
): Promise<void> {
  const existing = await loadAiConversations(mode);
  const next = existing.filter(c => c.id !== conversationId);
  await AsyncStorage.setItem(key('ai_conversations_' + mode), JSON.stringify(next));
}

// ---- Maintenance ----

export async function clearHistory(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const toRemove = allKeys.filter(k =>
    k.startsWith(key('training_logs/')) ||
    k.startsWith(key('diet_logs/')) ||
    k.startsWith(key('weight_logs/'))
  );
  if (toRemove.length > 0) {
    await AsyncStorage.removeMany(toRemove);
  }
}

export async function resetData(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const toRemove = allKeys.filter(k =>
    k.startsWith(key('training_logs/')) ||
    k.startsWith(key('diet_logs/')) ||
    k.startsWith(key('weight_logs/')) ||
    k.startsWith(key('current_workouts/'))
  );
  if (toRemove.length > 0) {
    await AsyncStorage.removeMany(toRemove);
  }
  await AsyncStorage.removeItem(key('profile.json'));
}
