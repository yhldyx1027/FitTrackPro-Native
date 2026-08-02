// ============================================================
// FitTrack Pro - Application State Context
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  Profile, TrainingPlan, Workout, TrainingLog, FoodItem,
  DietEntry, DietLog, WorkoutSet, Exercise, WeightRecord,
} from '../types';
import {
  Calc, DEFAULT_PROFILE, DEFAULT_FOOD_DB, createId,
  getTodayKey, toR, GOAL_LABELS, GENDER_LABELS, MEAL_LABELS,
} from '../utils/calculations';
import * as Storage from '../storage/storage';

// ---- Types ----

interface AppContextType {
  ready: boolean;
  profile: Profile;
  plans: TrainingPlan[];
  foodDb: FoodItem[];
  todayDietEntries: DietEntry[];
  todayTrainingLog: TrainingLog | null;
  todayWorkout: Workout | null;
  historyTrainingLogs: TrainingLog[];
  historyDietLogs: DietLog[];
  weightHistory: WeightRecord[];
  isTrainingDay: boolean;
  trainingCal: number;
  trainingVol: number;
  // Actions
  refreshAll: () => Promise<void>;
  updateProfile: (p: Partial<Profile>) => Promise<void>;
  upsertPlan: (p: TrainingPlan) => Promise<void>;
  removePlan: (id: string) => Promise<void>;
  startWorkoutFromPlan: (plan: TrainingPlan) => Promise<void>;
  updateWorkout: (w: Workout) => Promise<void>;
  completeWorkout: (w?: Workout) => Promise<void>;
  discardWorkout: () => Promise<void>;
  addDietEntry: (e: DietEntry) => Promise<void>;
  removeDietEntry: (i: number) => Promise<void>;
  replaceFoodDb: (items: FoodItem[]) => Promise<void>;
  saveWeightRecord: (weight: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  resetData: () => Promise<void>;
  // Helpers
  createBlankPlan: () => TrainingPlan;
  createBlankSet: () => { id: string; reps: null; weight: null };
  createBlankExercise: () => Exercise;
}

const AppContext = createContext<AppContextType | null>(null);

// ---- Provider ----

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [foodDb, setFoodDb] = useState<FoodItem[]>([]);
  const [todayDietEntries, setTodayDietEntries] = useState<DietEntry[]>([]);
  const [todayTrainingLog, setTodayTrainingLog] = useState<TrainingLog | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  const [historyTrainingLogs, setHistoryTrainingLogs] = useState<TrainingLog[]>([]);
  const [historyDietLogs, setHistoryDietLogs] = useState<DietLog[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightRecord[]>([]);

  const today = getTodayKey();

  // Derived state
  const isTrainingDay = !!(todayTrainingLog || todayWorkout);
  const trainingEstimate = todayWorkout
    ? Calc.estimateWorkoutMetrics(profile, todayWorkout)
    : { volume: 0, calories: 0 };
  // While a workout is in progress, show its LIVE estimate; fall back to the
  // completed log only when there is no in-progress workout.
  const trainingCal = todayWorkout ? trainingEstimate.calories : (todayTrainingLog?.calories ?? 0);
  const trainingVol = todayWorkout ? trainingEstimate.volume : (todayTrainingLog?.volume ?? 0);

  // ---- Data Loading ----

  const refreshAll = useCallback(async () => {
    const [p, pl, fdb, dietEntries, trLog, workout, trLogs, dietLogs, weights] = await Promise.all([
      Storage.loadProfile(),
      Storage.loadPlans(),
      Storage.loadFoodDb(),
      Storage.loadDietEntries(today),
      Storage.loadTrainingLog(today),
      Storage.loadCurrentWorkout(today),
      Storage.loadTrainingLogs(),
      Storage.loadDietHistoryLogs(),
      Storage.loadWeightHistory(),
    ]);
    setProfile(p || DEFAULT_PROFILE);
    setPlans(pl);
    // Do NOT re-seed defaults: an intentionally emptied library must stay empty.
    setFoodDb(fdb);
    setTodayDietEntries(dietEntries);
    setTodayTrainingLog(trLog);
    setTodayWorkout(workout);
    setHistoryTrainingLogs(trLogs);
    setHistoryDietLogs(dietLogs);
    setWeightHistory(weights);
  }, [today]);

  // Initialize
  useEffect(() => {
    (async () => {
      // Seed default data if first run
      const p = await Storage.loadProfile();
      if (!p) {
        await Storage.saveProfile(DEFAULT_PROFILE);
        await Storage.saveFoodDb(DEFAULT_FOOD_DB);
      }
      await refreshAll();
      setReady(true);
    })();
  }, [refreshAll]);

  // AppState listener for background/foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (_nextAppState: AppStateStatus) => {
      appState.current = _nextAppState;
    });
    return () => sub.remove();
  }, []);

  // ---- Actions ----

  const updateProfile = useCallback(async (p: Partial<Profile>) => {
    const next = {
      height: p.height !== undefined ? p.height : profile.height,
      weight: p.weight !== undefined ? p.weight : profile.weight,
      age: p.age !== undefined ? p.age : profile.age,
      gender: p.gender !== undefined ? p.gender : profile.gender,
      goal: p.goal !== undefined ? p.goal : profile.goal,
      activityFactor: p.activityFactor !== undefined ? p.activityFactor : profile.activityFactor,
    };
    await Storage.saveProfile(next);
    setProfile(next);
  }, [profile]);

  const upsertPlan = useCallback(async (plan: TrainingPlan) => {
    await Storage.savePlan(plan);
    const updated = await Storage.loadPlans();
    setPlans(updated);
  }, []);

  const removePlan = useCallback(async (id: string) => {
    await Storage.deletePlan(id);
    const updated = await Storage.loadPlans();
    setPlans(updated);
    if (todayWorkout?.sourcePlanId === id) {
      await Storage.deleteCurrentWorkout(today);
      setTodayWorkout(null);
    }
  }, [todayWorkout, today]);

  const startWorkoutFromPlan = useCallback(async (plan: TrainingPlan) => {
    const sets: WorkoutSet[] = plan.exercises.flatMap((ex, order) =>
      ex.sets.map((st, i) => ({
        id: createId('set'),
        exerciseId: ex.id,
        exercise: ex.name,
        exerciseType: ex.exerciseType,
        met: ex.met ?? null,
        bodyweightLoadFactor: ex.bodyweightLoadFactor ?? null,
        exerciseOrder: order,
        setNumber: i + 1,
        weight: st.weight ?? 0,
        reps: st.reps ?? 0,
        completed: false,
      }))
    );
    const w: Workout = {
      date: today,
      sourcePlanId: plan.id,
      sourcePlanName: plan.name || '未命名计划',
      durationMinutes: plan.estimatedDurationMinutes ?? 0,
      sets,
      startedAt: Date.now(),
    };
    await Storage.saveCurrentWorkout(w);
    setTodayWorkout(w);
  }, [today]);

  const updateWorkout = useCallback(async (w: Workout) => {
    // Clone so React sees a new reference (callers may have mutated .sets in place).
    const next = { ...w, sets: [...w.sets] };
    await Storage.saveCurrentWorkout(next);
    setTodayWorkout(next);
  }, []);

  const completeWorkout = useCallback(async (w?: Workout) => {
    const workout = w ?? todayWorkout;
    if (!workout) return;
    const metrics = Calc.estimateWorkoutMetrics(profile, workout);
    const completedSets = workout.sets.filter(s => s.completed);
    const log: TrainingLog = {
      date: workout.date,
      planUsed: workout.sourcePlanName,
      durationMinutes: workout.durationMinutes,
      sets: completedSets,
      volume: metrics.volume,
      calories: metrics.calories,
    };
    await Storage.saveTrainingLog(log);
    await Storage.deleteCurrentWorkout(workout.date);
    setTodayTrainingLog(log);
    setTodayWorkout(null);
    const logs = await Storage.loadTrainingLogs();
    setHistoryTrainingLogs(logs);
  }, [todayWorkout, profile]);

  const discardWorkout = useCallback(async () => {
    await Storage.deleteCurrentWorkout(today);
    setTodayWorkout(null);
  }, [today]);

  const addDietEntry = useCallback(async (entry: DietEntry) => {
    const updated = [...todayDietEntries, entry];
    await Storage.saveDietEntries(today, updated);
    setTodayDietEntries(updated);
  }, [todayDietEntries, today]);

  const removeDietEntry = useCallback(async (index: number) => {
    const updated = todayDietEntries.filter((_, i) => i !== index);
    await Storage.saveDietEntries(today, updated);
    setTodayDietEntries(updated);
  }, [todayDietEntries, today]);

  const replaceFoodDb = useCallback(async (items: FoodItem[]) => {
    await Storage.saveFoodDb(items);
    setFoodDb(items);
  }, []);

  const saveWeightRecord = useCallback(async (weight: number) => {
    await Storage.saveWeight(today, weight);
  }, [today]);

  const clearHistory = useCallback(async () => {
    await Storage.clearHistory();
    setTodayDietEntries([]);
    setTodayTrainingLog(null);
    setHistoryTrainingLogs([]);
    setHistoryDietLogs([]);
  }, []);

  const resetData = useCallback(async () => {
    await Storage.resetData();
    setProfile(DEFAULT_PROFILE);
    setTodayDietEntries([]);
    setTodayTrainingLog(null);
    setTodayWorkout(null);
    setHistoryTrainingLogs([]);
    setHistoryDietLogs([]);
  }, []);

  const createBlankPlan = useCallback((): TrainingPlan => ({
    id: createId('plan'),
    name: '',
    notes: '',
    estimatedDurationMinutes: null,
    exercises: [{
      id: createId('exercise'),
      name: '',
      sets: [{ id: createId('plan-set'), reps: null, weight: null }],
      exerciseType: 'weighted',
      met: null,
      bodyweightLoadFactor: 0.7,
    }],
  }), []);

  const createBlankSet = useCallback(() => ({
    id: createId('plan-set'), reps: null, weight: null,
  }), []);

  const createBlankExercise = useCallback((): Exercise => ({
    id: createId('exercise'),
    name: '',
    sets: [{ id: createId('plan-set'), reps: null, weight: null }],
    exerciseType: 'weighted',
    met: null,
    bodyweightLoadFactor: 0.7,
  }), []);

  const value: AppContextType = {
    ready, profile, plans, foodDb, todayDietEntries, todayTrainingLog,
    todayWorkout, historyTrainingLogs, historyDietLogs,
    weightHistory, isTrainingDay, trainingCal, trainingVol,
    refreshAll, updateProfile, upsertPlan, removePlan,
    startWorkoutFromPlan, updateWorkout, completeWorkout, discardWorkout,
    addDietEntry, removeDietEntry, replaceFoodDb, saveWeightRecord,
    clearHistory, resetData, createBlankPlan, createBlankSet, createBlankExercise,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
