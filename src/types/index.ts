// ============================================================
// FitTrack Pro - Type Definitions
// ============================================================

export type Gender = 'male' | 'female';
export type Goal = 'cutting' | 'maintenance' | 'bulking';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ExerciseType = 'cardio' | 'weighted' | 'bodyweight';

export interface Profile {
  height: number | null;
  weight: number | null;
  age: number | null;
  gender: Gender | null;
  goal: Goal | null;
  activityFactor: number | null;
}

export interface FoodItem {
  name: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface DietEntry extends FoodItem {
  servings: number;
  mealType: MealType;
}

export interface DietTotals {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface Exercise {
  id: string;
  name: string;
  sets: PlanSet[];
  exerciseType: ExerciseType;
  met: number | null;
  bodyweightLoadFactor: number;
}

export interface PlanSet {
  id: string;
  reps: number | null;
  weight: number | null;
}

export interface TrainingPlan {
  id: string;
  name: string;
  notes: string;
  estimatedDurationMinutes: number | null;
  exercises: Exercise[];
}

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  exercise: string;
  exerciseType: ExerciseType;
  met: number | null;
  bodyweightLoadFactor: number | null;
  exerciseOrder: number;
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}

export interface Workout {
  date: string;
  sourcePlanId: string;
  sourcePlanName: string;
  durationMinutes: number;
  sets: WorkoutSet[];
  startedAt?: number; // epoch ms, for uninterrupted workout timer across app restarts
}

export interface TrainingLog {
  id?: string;
  date: string;
  planUsed: string;
  durationMinutes: number;
  sets: WorkoutSet[];
  volume: number;
  calories: number;
}

export interface DietLog {
  date: string;
  entries: DietEntry[];
}

export interface WeightRecord {
  date: string;
  weight: number;
}

export interface MacroTargets {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface DashboardMetrics {
  bmr: number;
  tdee: number;
  recommendedCalories: number;
  targetMacros: MacroTargets;
  consumedCalories: number;
  consumedCarbs: number;
  consumedProtein: number;
  consumedFat: number;
  trainingDay: boolean;
}

export interface WorkoutMetrics {
  volume: number;
  calories: number;
}
