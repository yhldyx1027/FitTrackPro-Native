// ============================================================
// FitTrack Pro - DeepSeek AI Service
// ------------------------------------------------------------
// Pure fetch-based OpenAI-compatible chat client for DeepSeek.
// The API key lives in local AsyncStorage only, and is never
// bundled into the app or uploaded anywhere except DeepSeek.
// ============================================================

import { Profile, DietEntry, DietLog, TrainingLog, TrainingPlan, Workout, WorkoutSet, WeightRecord, ExerciseType, FoodItem } from '../types';
import { Calc, toR, GOAL_LABELS, GENDER_LABELS, MEAL_LABELS } from '../utils/calculations';

export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const DEFAULT_AI_MODEL = 'deepseek-chat';

export const AI_MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat（快速）' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner（深度）' },
] as const;

export interface AiSettings {
  apiKey: string;
  model: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiContext {
  profile: Profile;
  dietEntries: DietEntry[];
  foodDb: FoodItem[];
  trainingLogs: TrainingLog[];
  isTrainingDay: boolean;
  trainingCal: number;
  recentTrainingLogs: TrainingLog[];
  recentDietLogs: DietLog[];
  weightHistory: WeightRecord[];
}

export interface ParsedFood {
  name: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface AiTrainingContext {
  profile: Profile;
  plans: TrainingPlan[];
  todayWorkout: Workout | null;
  todayTrainingLogs: TrainingLog[];
  isTrainingDay: boolean;
  trainingCal: number;
  trainingVol: number;
  recentTrainingLogs: TrainingLog[];
  recentDietLogs: DietLog[];
  weightHistory: WeightRecord[];
}

export interface GeneratedPlanExercise {
  name: string;
  exerciseType: ExerciseType;
  sets: { reps: number | null; weight: number | null }[];
}

export interface GeneratedTrainingPlan {
  name: string;
  notes: string;
  estimatedDurationMinutes: number | null;
  exercises: GeneratedPlanExercise[];
}

const GOAL_ADJUSTMENT: Record<string, number> = {
  cutting: -350,
  maintenance: 0,
  bulking: 250,
};

const RATIO_LABEL: Record<string, string> = {
  cutting: '减脂（热量缺口 350 千卡）',
  maintenance: '维持（热量持平）',
  bulking: '增肌（热量盈余 250 千卡）',
};

// ---- History formatters ----

function daysAgoKey(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDietHistory(dietLogs: DietLog[], trainingDates: Set<string>): string {
  const sorted = [...dietLogs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);
  if (sorted.length === 0) return '近14天无饮食记录';
  return sorted
    .map(log => {
      const t = Calc.dietTotals(log.entries);
      return `${log.date.slice(5)} ${trainingDates.has(log.date) ? '训练日' : '休息日'} 摄入${toR(t.calories)}千卡(碳${toR(t.carbs)} 蛋${toR(t.protein)} 脂${toR(t.fat)})`;
    })
    .join('；');
}

function formatTrainingHistory(logs: TrainingLog[]): string {
  const sorted = [...logs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
  if (sorted.length === 0) return '近30天无训练记录';
  return sorted
    .map(l => `${l.date.slice(5)} ${l.planUsed} 容量${toR(l.volume)} 消耗${toR(l.calories)}千卡`)
    .join('；');
}

function formatWeightHistory(weights: WeightRecord[]): string {
  const sorted = [...weights]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);
  if (sorted.length === 0) return '暂无体重记录';
  return sorted.map(w => `${w.date.slice(5)}:${w.weight}kg`).join(' → ');
}

function formatTodayFoods(entries: DietEntry[]): string {
  if (entries.length === 0) return '无记录';
  return entries
    .map(e => {
      const total = e.calories * e.servings;
      return `${MEAL_LABELS[e.mealType]}·${e.name}×${e.servings}(${toR(total)}千卡,碳${toR(e.carbs * e.servings)} 蛋${toR(e.protein * e.servings)} 脂${toR(e.fat * e.servings)})`;
    })
    .join('；');
}

function formatTodayTraining(workout: Workout | null, logs: TrainingLog[]): string {
  const parts: string[] = [];
  if (workout) {
    const done = workout.sets.filter(s => s.completed).length;
    parts.push(`进行中：${workout.sourcePlanName}（已勾 ${done}/${workout.sets.length} 组）`);
  }
  for (const log of logs) {
    // Group sets by exercise and summarize each set compactly.
    const byEx = new Map<string, WorkoutSet[]>();
    log.sets.forEach(s => {
      const k = s.exerciseId || s.exercise;
      if (!byEx.has(k)) byEx.set(k, []);
      byEx.get(k)!.push(s);
    });
    const exTexts = Array.from(byEx.values()).map(sets => {
      const setName = sets[0]?.exercise || '动作';
      const setTexts = sets.map(s => {
        if (s.exerciseType === 'cardio') return `${s.reps}分钟`;
        if (s.exerciseType === 'bodyweight') return `自重×${s.reps}`;
        return `${s.weight || 0}kg×${s.reps}`;
      }).join('/');
      return `${setName} ${sets.length}组(${setTexts})`;
    });
    parts.push(`${log.planUsed}：${exTexts.join('；')}`);
  }
  return parts.length > 0 ? parts.join(' ｜ ') : '无';
}

function last7DaysTrainingCount(logs: TrainingLog[]): number {
  const cutoff = daysAgoKey(7);
  return logs.filter(l => l.date >= cutoff).length;
}

export function buildAiSystemPrompt(ctx: AiContext): string {
  const { profile, dietEntries, foodDb, isTrainingDay, trainingCal, recentTrainingLogs, recentDietLogs, weightHistory } = ctx;

  const hasProfile = !!(profile.height && profile.weight && profile.age && profile.gender && profile.goal);
  const genderLabel = profile.gender ? GENDER_LABELS[profile.gender] : '未设置';
  const goalLabel = profile.goal ? GOAL_LABELS[profile.goal] : '未设置';

  const bmr = Calc.bmr(profile);
  const tdee = Calc.tdee(profile, trainingCal);
  const goalAdj = profile.goal ? GOAL_ADJUSTMENT[profile.goal] ?? 0 : 0;
  const recommended = tdee + goalAdj;
  const macros = Calc.macroTargets(recommended, isTrainingDay);

  const consumed = Calc.dietTotals(dietEntries);
  const remaining = Math.max(recommended - consumed.calories, 0);

  const trainingDates = new Set(recentTrainingLogs.map(l => l.date));
  const dietHistory = formatDietHistory(recentDietLogs, trainingDates);
  const trainingHistory = formatTrainingHistory(recentTrainingLogs);
  const weightTrend = formatWeightHistory(weightHistory);
  const freq7 = last7DaysTrainingCount(recentTrainingLogs);

  const mealBreakdown = (() => {
    const labels = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    const parts: string[] = [];
    for (const mt of labels) {
      const list = dietEntries.filter(e => e.mealType === mt);
      if (list.length > 0) {
        const kcal = list.reduce((s, e) => s + e.calories * e.servings, 0);
        parts.push(`${MEAL_LABELS[mt]} ${toR(kcal)}千卡`);
      }
    }
    return parts.length > 0 ? parts.join('，') : '无记录';
  })();

  return [
    '你是 FitTrack Pro 内置的「饮食 AI 助手」，帮助用户查询食物热量、配置碳蛋脂、安排一日三餐与加餐。',
    '请用简体中文、专业但口语化的语气回答，回答要简洁具体。',
    '',
    '【用户资料】',
    hasProfile
      ? `性别：${genderLabel}｜身高：${profile.height}cm｜体重：${profile.weight}kg｜年龄：${profile.age}岁｜目标：${goalLabel}｜活动系数：${profile.activityFactor}`
      : '尚未完善（身高/体重/年龄/性别/目标不完整），请先提示用户到「设置」页补全身体数据，再结合用户问题给通用估算。',
    '',
    '【食物库】',
    foodDb.length > 0
      ? foodDb.map(f => `${f.name}(${f.calories}千卡,碳${f.carbs} 蛋${f.protein} 脂${f.fat})`).join('；')
      : '暂无',
    '',
    '【今日数据】',
    `今日状态：${isTrainingDay ? '训练日' : '休息日'}（宏量比例 ${isTrainingDay ? '碳水50%·蛋白30%·脂肪20%' : '碳水40%·蛋白30%·脂肪30%'}）`,
    `基础代谢 BMR：${toR(bmr)} 千卡`,
    `日常消耗 TDEE（活动系数+训练消耗）：${toR(tdee)} 千卡（其中训练消耗 ${toR(trainingCal)} 千卡）`,
    `建议摄入：${toR(recommended)} 千卡（${profile.goal ? RATIO_LABEL[profile.goal] || goalLabel : '目标未设置'}）`,
    `宏量目标：碳水 ${toR(macros.carbs)}g｜蛋白质 ${toR(macros.protein)}g｜脂肪 ${toR(macros.fat)}g`,
    `今日已摄入：${toR(consumed.calories)} 千卡（碳水 ${toR(consumed.carbs)}g／蛋白 ${toR(consumed.protein)}g／脂肪 ${toR(consumed.fat)}g），剩余额度约 ${toR(remaining)} 千卡`,
    `按餐次：${mealBreakdown}`,
    `今日具体饮食：${formatTodayFoods(dietEntries)}`,
    '',
    '【近期历史】',
    `近7天训练 ${freq7} 次｜近10次训练：${trainingHistory}`,
    `近14天饮食：${dietHistory}`,
    `体重趋势：${weightTrend}`,
    '',
    '【回答要求】',
    '1. 用户询问食物时，给出每 100 克（或每个/每份）的热量、碳水、蛋白质、脂肪，并主动结合剩余额度给出建议。',
    '2. 涉及份量换算时用数据说话，引用用户资料中的目标摄入与剩余额度。',
    '3. 凡是提到"建议摄入/今日已摄入/剩余额度/宏量目标"等数字，必须直接引用上面【今日数据】中给出的数值，不要自行重新计算或估算；',
    '4. 安排三餐/加餐时给出具体食物建议，并检查总热量是否接近建议摄入，避免超支。',
    '5. 回答控制在 2~6 行，可用「热量｜碳水｜蛋白｜脂肪」格式排版，不要冗长。',
    '6. 不要编造 API、链接或下载地址；不确定的数据如实说明并建议以食品标签为准。',
    '7. 请记住本对话中用户提到过的食物、口味和习惯，后续回答主动引用，不要重复问已经说过的信息。',
    '8. 只要满足以下任一情况（无论这是第几轮对话），都必须在回答最后输出结构化 JSON：',
    '   (a) 用户描述了他吃了什么（如"我中午吃了200克鸡胸肉和一碗米饭""今天早餐吃了两个鸡蛋和燕麦""记录一下我刚吃的"）；',
    '   (b) 用户要求添加、修改或更新食物库中的食物（如"把鸡胸肉的热量改成165""帮我加一条燕麦""鸡胸肉的蛋白不对，改成31"）——修改时 name 必须与【食物库】中现有食物的名称完全一致，并输出修正后的完整数值；',
    '   - 先逐项估算并汇总这顿饭的总热量、碳水、蛋白质、脂肪（克），份量不确定时做合理假设并注明；',
    '   - 然后在回答的最后单独输出一行结构化 JSON（记录/添加/修改都要输出），格式必须严格为：',
    '     __FOOD_JSON__{"name":"<简洁食物名，如：鸡胸肉+米饭 午餐>","calories":<整数>,"carbs":<数字>,"protein":<数字>,"fat":<数字>}__END__',
    '   - name 要能概括这顿饭（含主要食物与份量），四个数值四舍五入到整数或一位小数；',
    '   - 除了 __FOOD_JSON__ 那一行，正文中不要出现其他大括号 JSON，确保我能解析出这一行。',
    '   - 这条规则对每一轮对话都生效：只要本轮用户描述了吃了什么，就绝对不要省略 __FOOD_JSON__ 输出。',
  ].join('\n');
}

export function buildTrainingSystemPrompt(ctx: AiTrainingContext): string {
  const { profile, plans, isTrainingDay, trainingCal, trainingVol, recentTrainingLogs, recentDietLogs, weightHistory } = ctx;

  const hasProfile = !!(profile.height && profile.weight && profile.age && profile.gender && profile.goal);
  const genderLabel = profile.gender ? GENDER_LABELS[profile.gender] : '未设置';
  const goalLabel = profile.goal ? GOAL_LABELS[profile.goal] : '未设置';

  const planList = plans.length > 0
    ? plans.map(p => `「${p.name || '未命名'}」(${p.exercises.length}个动作)`).join('、')
    : '暂无';

  const trainingDates = new Set(recentTrainingLogs.map(l => l.date));
  const dietHistory = formatDietHistory(recentDietLogs, trainingDates);
  const trainingHistory = formatTrainingHistory(recentTrainingLogs);
  const weightTrend = formatWeightHistory(weightHistory);
  const freq7 = last7DaysTrainingCount(recentTrainingLogs);

  return [
    '你是 FitTrack Pro 内置的「训练 AI 助手」，帮助用户安排训练计划、优化动作组合、给出训练建议。',
    '请用简体中文、专业但口语化的语气回答，回答要简洁具体。',
    '',
    '【用户资料】',
    hasProfile
      ? `性别：${genderLabel}｜身高：${profile.height}cm｜体重：${profile.weight}kg｜年龄：${profile.age}岁｜目标：${goalLabel}｜活动系数：${profile.activityFactor}`
      : '尚未完善（身高/体重/年龄/性别/目标不完整），请先提示用户到「设置」页补全身体数据，再结合用户问题给通用建议。',
    '',
    '【今日状态】',
    `今日：${isTrainingDay ? '训练日' : '休息日'}`,
    isTrainingDay
      ? `今日训练：${ctx.todayWorkout?.sourcePlanName ?? (ctx.todayTrainingLogs.map(l => l.planUsed).join('、') || '进行中')}｜实时容量 ${toR(trainingVol)}｜消耗 ${toR(trainingCal)} 千卡`
      : '今天还没有训练，可以建议安排训练或休息恢复。',
    `今日训练明细：${formatTodayTraining(ctx.todayWorkout, ctx.todayTrainingLogs)}`,
    '',
    '【计划库现状】',
    planList,
    '',
    '【近期历史】',
    `近7天训练 ${freq7} 次｜近10次训练：${trainingHistory}`,
    `体重趋势：${weightTrend}`,
    `近14天饮食：${dietHistory}`,
    '',
    '【回答要求】',
    '1. 用户问训练建议时：结合他的身体数据、目标和计划库现状，给出动作选择、组数次数、重量强度、频率与恢复建议。',
    '2. 回答时主动引用近期历史（训练频率、容量/消耗变化、体重趋势），避免重复刺激或过度训练。',
    '3. 记住本对话中用户提到过的训练安排、动作偏好和进度，后续回答主动引用。',
    '4. 凡是提到"今日状态/训练次数/容量/消耗/体重"等数字，必须直接引用上面【今日状态】【近期历史】中给出的数值，不要自行重新计算；',
    '5. 增肌建议以 8~12 次、3~4 组为主；力量 4~6 次；减脂可加入有氧/超级组，并提示控制总时长。',
    '6. 当用户要求"生成训练计划"或"帮我安排计划"时（无论第几轮对话）：',
    '   - 先简短说明这个计划的思路（目标、频率、重点），然后在回答最后单独输出一行结构化 JSON，格式必须严格为：',
    '     __PLAN_JSON__{"name":"<计划名>","notes":"<1~2句说明>","estimatedDurationMinutes":<预计分钟数>,"exercises":[{"name":"<动作名>","exerciseType":"weighted|bodyweight|cardio","sets":[{"reps":<次数>,"weight":<公斤数或null>},...]}]}__END__',
    '   - exerciseType 只能是 weighted（负重）、bodyweight（自重）、cardio（有氧）三者之一；',
    '   - 负重动作的 weight 填公斤数（如 60），可填 null 表示待定；自重动作 weight 填 null；有氧动作把 reps 当作"分钟"填写；',
    '   - 一个计划包含 4~8 个动作，每个动作 2~4 组，覆盖目标肌群；',
    '   - 若用户说"按照现有计划优化"，请在 plan 的 notes 里注明调整点。',
    '7. 除了 __PLAN_JSON__ 那一行，正文中不要出现其他大括号 JSON，确保我能解析出这一行。',
    '8. 不要编造 API、链接或下载地址；不确定时如实说明。',
  ].join('\n');
}

/**
 * Send a chat request to DeepSeek (OpenAI-compatible endpoint).
 * Throws a user-friendly Error on failure.
 */
export async function chatWithDeepSeek(
  apiKey: string,
  model: string,
  history: AiChatMessage[],
  systemPrompt: string
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error?.message || body?.message || '';
      } catch {
        // ignore parse errors
      }
      const reason = detail ? `：${detail}` : '';
      throw new Error(`请求失败（HTTP ${res.status}）${reason}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content as string | undefined;
    if (!content || !content.trim()) {
      throw new Error('AI 没有返回内容，请重试');
    }
    return content;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('请求超时，请检查网络后重试');
    }
    if (e instanceof TypeError || e?.message?.includes('Network request failed')) {
      throw new Error('网络连接失败，请检查网络后重试');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the structured food item the model attached to its reply.
 * Prefers the explicit __FOOD_JSON__ marker; falls back to the last
 * JSON-looking object that has a "name" plus nutrition keys.
 */
export function extractFoodFromReply(reply: string): ParsedFood | null {
  let block: string | null = null;

  const marked = reply.match(/__FOOD_JSON__([\s\S]*?)__END__/);
  if (marked) {
    block = marked[1].trim();
  } else {
    const objs = extractBalancedJsonObjects(reply);
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.includes('"name"') && (o.includes('"calories"') || o.includes('"protein"'))) {
        block = o;
        break;
      }
    }
  }

  if (!block) return null;

  // The model sometimes wraps JSON in markdown code fences.
  block = block.replace(/```(?:json)?/g, '').trim();

  try {
    const obj = JSON.parse(block);
    const name = String(obj.name ?? '').trim();
    const toNum = (v: any): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const calories = toNum(obj.calories);
    const carbs = toNum(obj.carbs);
    const protein = toNum(obj.protein);
    const fat = toNum(obj.fat);
    if (!name || calories == null || carbs == null || protein == null || fat == null) {
      return null;
    }
    return { name, calories, carbs, protein, fat };
  } catch {
    return null;
  }
}

/**
 * Extract the structured training plan the model attached to its reply.
 */
export function extractTrainingPlanFromReply(reply: string): GeneratedTrainingPlan | null {
  let block: string | null = null;

  const marked = reply.match(/__PLAN_JSON__([\s\S]*?)__END__/);
  if (marked) {
    block = marked[1].trim();
  } else {
    const objs = extractBalancedJsonObjects(reply);
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.includes('"exercises"') && o.includes('"name"')) {
        block = o;
        break;
      }
    }
  }

  if (!block) return null;

  block = block.replace(/```(?:json)?/g, '').trim();

  try {
    const obj = JSON.parse(block);
    const name = String(obj.name ?? '').trim();
    if (!name) return null;

    const notes = String(obj.notes ?? '').trim();
    const duration =
      Number.isFinite(Number(obj.estimatedDurationMinutes))
        ? Math.max(0, Number(obj.estimatedDurationMinutes))
        : null;

    const rawExercises: any[] = Array.isArray(obj.exercises) ? obj.exercises : [];
    const exercises: GeneratedPlanExercise[] = [];
    for (const raw of rawExercises) {
      const exName = String(raw?.name ?? '').trim();
      const type = raw?.exerciseType;
      const exType: ExerciseType =
        type === 'cardio' ? 'cardio' : type === 'bodyweight' ? 'bodyweight' : 'weighted';
      const rawSets: any[] = Array.isArray(raw?.sets) ? raw.sets : [];
      const sets = rawSets.map(s => {
        const reps = Number.isFinite(Number(s?.reps)) ? Math.max(0, Number(s?.reps)) : null;
        const w = s?.weight;
        const weight = w == null || w === '' || !Number.isFinite(Number(w)) ? null : Math.max(0, Number(w));
        return { reps, weight };
      }).filter(s => s.reps != null || s.weight != null);
      if (exName && sets.length > 0) {
        exercises.push({ name: exName, exerciseType: exType, sets });
      }
    }

    if (exercises.length === 0) return null;
    return { name, notes, estimatedDurationMinutes: duration, exercises };
  } catch {
    return null;
  }
}

/**
 * Extract all balanced JSON-ish objects `{...}` from a string, handling
 * nested braces correctly (works even without the __*_JSON__ markers).
 */
function extractBalancedJsonObjects(text: string): string[] {
  const results: string[] = [];
  const MAX_LEN = 12000;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let j = i; j < text.length && j - i < MAX_LEN; j++) {
      const ch = text[j];
      if (inStr) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          results.push(text.slice(i, j + 1));
          break;
        }
      }
    }
  }
  return results;
}
