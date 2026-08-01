// ============================================================
// FitTrack Pro - Calculation Logic
// Migrated from calculations.js with improved accuracy
// ============================================================

import { Profile, FoodItem, DietEntry, DietTotals, WorkoutSet, TrainingLog, MacroTargets, DashboardMetrics, WorkoutMetrics } from '../types';

const GOAL_ADJUSTMENT: Record<string, number> = {
  cutting: -350,
  maintenance: 0,
  bulking: 250,
};

const TRAINING_DAY_RATIO = { carbs: 0.5, protein: 0.3, fat: 0.2 };
const REST_DAY_RATIO = { carbs: 0.4, protein: 0.3, fat: 0.3 };

export const Calc = {
  /**
   * Harris-Benedict BMR formula
   */
  bmr(profile: Profile): number {
    const { weight, height, age, gender } = profile;
    if (weight == null || height == null || age == null || gender == null) return 0;
    if (gender === 'male') {
      return 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
    }
    return 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;
  },

  /**
   * Training volume = sum(weight * reps) for completed sets
   */
  trainingVolume(sets: WorkoutSet[]): number {
    return sets
      .filter(s => s.completed)
      .reduce((total, s) => total + (s.weight || 0) * (s.reps || 0), 0);
  },

  /**
   * Training calories = MET * 3.5 * weight * duration / 200 * (1 + volumeAdjustment)
   * ACSM formula with volume-based intensity correction
   * Improved: volume divisor 5000 (was 10000), cap 2.0 (was 1.2), multiplier 0.25 (was 0.15)
   */
  trainingCalories(weightKg: number, durationMinutes: number, averageMet: number, volume: number): number {
    const metCal = (averageMet * 3.5 * weightKg * durationMinutes) / 200;
    const volumeAdj = Math.min(volume / 5000, 2.0);
    return metCal * (1 + volumeAdj * 0.25);
  },

  /**
   * TDEE = BMR * activityFactor + trainingCalories
   */
  tdee(profile: Profile, trainingCalories: number): number {
    const af = profile.activityFactor ?? 1;
    return Calc.bmr(profile) * af + trainingCalories;
  },

  /**
   * Macro targets
   * Training day: carbs/protein/fat = 5/3/2
   * Rest day: carbs/protein/fat = 4/3/3
   */
  macroTargets(calories: number, trainingDay: boolean): MacroTargets {
    const ratio = trainingDay ? TRAINING_DAY_RATIO : REST_DAY_RATIO;
    return {
      calories,
      carbs: (calories * ratio.carbs) / 4,
      protein: (calories * ratio.protein) / 4,
      fat: (calories * ratio.fat) / 9,
    };
  },

  /**
   * Aggregate diet entries into totals
   */
  dietTotals(entries: DietEntry[]): DietTotals {
    return entries.reduce(
      (totals, item) => ({
        calories: totals.calories + item.calories * item.servings,
        carbs: totals.carbs + item.carbs * item.servings,
        protein: totals.protein + item.protein * item.servings,
        fat: totals.fat + item.fat * item.servings,
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 }
    );
  },

  /**
   * Estimate workout metrics (volume, calories) from current workout
   */
  estimateWorkoutMetrics(profile: Profile, workout: { sets: WorkoutSet[] } | null): WorkoutMetrics {
    if (!workout) return { volume: 0, calories: 0 };

    const completedSets = workout.sets.filter(s => s.completed);
    const volume = Calc.trainingVolume(completedSets);

    // Group sets by exercise for per-exercise calorie calculation
    const groups = new Map<string, WorkoutSet[]>();
    completedSets.forEach(set => {
      const key = set.exerciseId || set.exercise;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(set);
    });

    const totalCalories = Array.from(groups.values()).reduce((total, sets) => {
      const etype = sets[0]?.exerciseType || 'weighted';
      // Improved defaults: cardio 7 (was 6), bodyweight 5 (was 4.8), weighted 5.5
      const met = sets[0]?.met ?? (etype === 'cardio' ? 7 : etype === 'bodyweight' ? 5 : 5.5);
      const weightKg = profile.weight ?? 0;

      if (etype === 'cardio') {
        const totalMin = sets.reduce((s, set) => s + Math.max(set.reps, 0), 0);
        return total + Calc.trainingCalories(weightKg, totalMin, met, 0);
      }
      if (etype === 'bodyweight') {
        const totalReps = sets.reduce((s, set) => s + set.reps, 0);
        const loadFactor = sets[0]?.bodyweightLoadFactor ?? 0.7;
        const estVolume = totalReps * weightKg * loadFactor;
        // Improved: 2.5 min per set (was 2), reps/12 (was reps/15)
        const durMin = Math.max(sets.length * 2.5, totalReps / 12);
        return total + Calc.trainingCalories(weightKg, durMin, met, estVolume);
      }
      // weighted (default)
      const grpVol = sets.reduce((s, set) => s + set.weight * set.reps, 0);
      const grpReps = sets.reduce((s, set) => s + set.reps, 0);
      const durMin = Math.max(sets.length * 2.5, grpReps / 12);
      return total + Calc.trainingCalories(weightKg, durMin, met, grpVol);
    }, 0);

    return { volume, calories: totalCalories };
  },

  /**
   * Build complete dashboard metrics
   */
  buildDashboardMetrics(
    profile: Profile,
    trainingLog: TrainingLog | null,
    dietEntries: DietEntry[],
    isTrainingDay: boolean,
    trainingCalories: number
  ): DashboardMetrics {
    const bmr = Calc.bmr(profile);
    const tdee = Calc.tdee(profile, trainingCalories);
    const goalAdj = profile.goal ? GOAL_ADJUSTMENT[profile.goal] : 0;
    const recommendedCalories = tdee + goalAdj;
    const targetMacros = Calc.macroTargets(recommendedCalories, isTrainingDay);
    const consumed = Calc.dietTotals(dietEntries);

    return {
      bmr,
      tdee,
      recommendedCalories,
      targetMacros,
      consumedCalories: consumed.calories,
      consumedCarbs: consumed.carbs,
      consumedProtein: consumed.protein,
      consumedFat: consumed.fat,
      trainingDay: isTrainingDay,
    };
  },
};

// ---- Default Data ----

export const DEFAULT_PROFILE: Profile = {
  height: null, weight: null, age: null, gender: null, goal: null, activityFactor: null,
};

export const DEFAULT_FOOD_DB: FoodItem[] = [
  { name: '鸡胸肉 100克', calories: 165, carbs: 0, protein: 31, fat: 3.6 },
  { name: '熟米饭 100克', calories: 130, carbs: 28, protein: 2.7, fat: 0.3 },
  { name: '鸡蛋 1个', calories: 78, carbs: 0.6, protein: 6.3, fat: 5.3 },
  { name: '西兰花 100克', calories: 35, carbs: 7, protein: 2.4, fat: 0.4 },
  { name: '希腊酸奶 100克', calories: 97, carbs: 3.9, protein: 9, fat: 5 },
  { name: '香蕉 1根', calories: 105, carbs: 27, protein: 1.3, fat: 0.3 },
  { name: '三文鱼 100克', calories: 208, carbs: 0, protein: 20, fat: 13 },
];

export const EMPTY_FOOD: FoodItem = { name: '', calories: 100, carbs: 10, protein: 10, fat: 3 };

// ---- Helpers ----

export function createId(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

export function getTodayKey(d?: Date): string {
  const date = d || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toR(v: number): number {
  return Math.round(v);
}

export function fmtNum(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

export function parseNum(s: string): number | null {
  return s.trim() === '' ? null : Number(s) || 0;
}

export const GOAL_LABELS: Record<string, string> = {
  cutting: '减脂', maintenance: '维持', bulking: '增肌',
};

export const GENDER_LABELS: Record<string, string> = {
  male: '男性', female: '女性',
};

export const MEAL_LABELS: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐',
};

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
