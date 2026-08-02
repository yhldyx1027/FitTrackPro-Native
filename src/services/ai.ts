// ============================================================
// FitTrack Pro - DeepSeek AI Service
// ------------------------------------------------------------
// Pure fetch-based OpenAI-compatible chat client for DeepSeek.
// The API key lives in local AsyncStorage only, and is never
// bundled into the app or uploaded anywhere except DeepSeek.
// ============================================================

import { Profile, DietEntry, TrainingLog } from '../types';
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
  trainingLog: TrainingLog | null;
  isTrainingDay: boolean;
  trainingCal: number;
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

export function buildAiSystemPrompt(ctx: AiContext): string {
  const { profile, dietEntries, isTrainingDay, trainingCal } = ctx;

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
    '【今日数据】',
    `今日状态：${isTrainingDay ? '训练日' : '休息日'}（宏量比例 ${isTrainingDay ? '碳水50%·蛋白30%·脂肪20%' : '碳水40%·蛋白30%·脂肪30%'}）`,
    `基础代谢 BMR：${toR(bmr)} 千卡`,
    `日常消耗 TDEE（活动系数+训练消耗）：${toR(tdee)} 千卡（其中训练消耗 ${toR(trainingCal)} 千卡）`,
    `建议摄入：${toR(recommended)} 千卡（${profile.goal ? RATIO_LABEL[profile.goal] || goalLabel : '目标未设置'}）`,
    `宏量目标：碳水 ${toR(macros.carbs)}g｜蛋白质 ${toR(macros.protein)}g｜脂肪 ${toR(macros.fat)}g`,
    `今日已摄入：${toR(consumed.calories)} 千卡（碳水 ${toR(consumed.carbs)}g／蛋白 ${toR(consumed.protein)}g／脂肪 ${toR(consumed.fat)}g），剩余额度约 ${toR(remaining)} 千卡`,
    `按餐次：${mealBreakdown}`,
    '',
    '【回答要求】',
    '1. 用户询问食物时，给出每 100 克（或每个/每份）的热量、碳水、蛋白质、脂肪，并主动结合剩余额度给出建议。',
    '2. 涉及份量换算时用数据说话，引用用户资料中的目标摄入与剩余额度。',
    '3. 安排三餐/加餐时给出具体食物建议，并检查总热量是否接近建议摄入，避免超支。',
    '4. 回答控制在 2~6 行，可用「热量｜碳水｜蛋白｜脂肪」格式排版，不要冗长。',
    '5. 不要编造 API、链接或下载地址；不确定的数据如实说明并建议以食品标签为准。',
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
  ctx: AiContext
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: buildAiSystemPrompt(ctx) },
    ...history,
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

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
