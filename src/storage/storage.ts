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

export async function saveTrainingLog(log: TrainingLog): Promise<void> {
  await AsyncStorage.setItem(key('training_logs/' + log.date + '.json'), JSON.stringify(log));
}

export async function loadTrainingLog(date: string): Promise<TrainingLog | null> {
  try {
    const raw = await AsyncStorage.getItem(key('training_logs/' + date + '.json'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function loadTrainingLogs(): Promise<TrainingLog[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const logKeys = allKeys.filter(k => k.startsWith(key('training_logs/')));
    const entries = await AsyncStorage.getMany(logKeys);
    return logKeys
      .map(k => {
        const v = entries[k];
        return v ? JSON.parse(v) : null;
      })
      .filter((v): v is TrainingLog => v !== null)
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
