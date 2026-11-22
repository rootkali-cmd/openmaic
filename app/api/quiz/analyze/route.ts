/**
 * Quiz review — the "what now?" after a quiz.
 *
 * POST { topic, score, total, wrong: [{ question, options, answer, chosen, explain }] }
 * → { summary, weakPoints: [{ title, why, fix }], nextSteps: [string] }.
 *
 * This is deliberately a second, focused call: the grading already happened on
 * the client, and the teaching model is asked only to read the mistakes and
 * name the underlying skill plus one concrete fix per weakness. A malformed
 * reply is an honest error, never a canned analysis.
 */
import { NextRequest } from 'next/server';

import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, modelAuthorizationResponse } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Quiz Review');

interface WrongAnswer {
  question: string;
  options: string[];
  answer: number;
  chosen: number;
  explain?: string;
}

interface ReviewRequest {
  topic: string;
  score: number;
  total: number;
  wrong?: WrongAnswer[];
}

interface WeakPoint {
  title: string;
  why: string;
  fix: string;
}

interface Review {
  summary: string;
  weakPoints: WeakPoint[];
  nextSteps: string[];
}

const SYSTEM_PROMPT = `أنت مدرس عربي بتحلل غلطات طالب بعد اختبار قصير وتقترح عليه حلول عملية.
أعد JSON فقط، بدون أي نص خارجه، بالشكل ده:
{"summary":"جملة أو جملتين عن مستواه بصراحة وبدون مبالغة","weakPoints":[{"title":"اسم المهارة أو الفكرة اللي فيها ضعف","why":"سبب الغلط المحتمل في جملة","fix":"خطوة عملية محددة يقدر يعملها في 10 دقايق"}],"nextSteps":["خطوة","خطوة","خطوة"]}

قواعد:
- من 1 لـ 3 نقاط ضعف بس؛ كل نقطة مرتبطة بسؤال غلط فعلاً، مش كلام عام.
- fix يكون تمرين أو تصحيح مفهوم محدد (مثال: "تدرّب على قانون أوم: I=V/R في مسألتين، وابدأ بتحويل الوحدات").
- nextSteps من 2 لـ 4 خطوات قصيرة مرتبة.
- عربي فصحى مبسطة، ممنوع إنجليزي إلا لأسماء رموز علمية، وممنوع إيموجي.
- لو الطالب جاب الدرجة كاملة: summary يمدح بصدق، weakPoints فاضية، وnextSteps تحديات أكبر.`;

const ARABIC = /[\u0600-\u06FF]/;

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseReview(text: string): Review | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  const summary = asString(record.summary, 400);
  if (!summary || !ARABIC.test(summary)) return null;

  const weakPoints: WeakPoint[] = [];
  if (Array.isArray(record.weakPoints)) {
    for (const raw of record.weakPoints) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const title = asString(item.title, 90);
      const why = asString(item.why, 200);
      const fix = asString(item.fix, 240);
      if (!title || !fix) continue;
      weakPoints.push({ title, why, fix });
      if (weakPoints.length >= 3) break;
    }
  }

  const nextSteps: string[] = [];
  if (Array.isArray(record.nextSteps)) {
    for (const raw of record.nextSteps) {
      const step = asString(raw, 160);
      if (step) nextSteps.push(step);
      if (nextSteps.length >= 4) break;
    }
  }
  if (nextSteps.length === 0) return null;

  return { summary, weakPoints, nextSteps };
}

export async function POST(req: NextRequest) {
  let body: ReviewRequest;
  try {
    body = (await req.json()) as ReviewRequest;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }

  const topic = body.topic?.trim();
  const total = Math.max(1, Math.round(Number(body.total) || 0));
  const score = Math.min(total, Math.max(0, Math.round(Number(body.score) || 0)));
  if (!topic || topic.length > 200) {
    return apiError('INVALID_REQUEST', 400, 'topic must be 1-200 characters');
  }

  const wrong = (Array.isArray(body.wrong) ? body.wrong : []).slice(0, 6).filter((item) => {
    if (!item || typeof item !== 'object') return false;
    return asString(item.question, 400).length > 0;
  });

  try {
    const { model, thinkingConfig, serverManaged } = await resolveModelFromRequest(
      req,
      body,
      'quiz-generate',
    );

    const mistakes = wrong
      .map((item, index) => {
        const chosen = item.options?.[item.chosen] ?? 'لم يجب';
        const right = item.options?.[item.answer] ?? '';
        return `${index + 1}) ${item.question}\n   الإجابة الصح: ${right}\n   اختار: ${chosen}${
          item.explain ? `\n   شرح السؤال: ${item.explain}` : ''
        }`;
      })
      .join('\n');

    const prompt = `الموضوع: ${topic}
النتيجة: ${score} من ${total}
${
  wrong.length > 0
    ? `الأسئلة اللي غلط فيها:\n${mistakes}`
    : 'الطالب جاوب كل الأسئلة صح — اقترح تحدي أكبر.'
}

اكتب تحليل نقاط الضعف JSON الآن.`;

    const result = await callLLM(
      {
        model,
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 1_600,
        temperature: 0.4,
      },
      'quiz-review',
      undefined,
      thinkingConfig ?? { effort: 'low' },
      { serverManaged },
    );

    const review = parseReview(result.text ?? '');
    if (!review) {
      log.warn(`Unusable review reply (chars=${(result.text ?? '').length}) [topic="${topic.slice(0, 50)}"]`);
      return apiError(
        'QUIZ_UNPARSEABLE',
        502,
        'مقدرناش نجيب تحليل للاختبار ده — جرّب تاني.',
      );
    }

    return apiSuccess({ ...review });
  } catch (error) {
    const authorization = modelAuthorizationResponse(error);
    if (authorization) return authorization;
    log.error(`Quiz review failed [topic="${topic.slice(0, 50)}"]`, error);
    return apiError(
      'QUIZ_GENERATION_FAILED',
      502,
      'معلش، مقدرناش نحلل نتيجتك دلوقتي — جرّب تاني.',
    );
  }
}
