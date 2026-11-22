/**
 * Quiz generation — multiple-choice questions on any topic.
 *
 * POST { topic, count, difficulty } → { title, questions[] }.
 * The model returns JSON only; this route validates the shape so a malformed
 * reply becomes an honest error instead of a broken quiz.
 */
import { NextRequest } from 'next/server';

import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, modelAuthorizationResponse } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Quiz Generate');

interface QuizRequest {
  topic: string;
  count?: number;
  difficulty?: string;
}

interface Question {
  q: string;
  options: string[];
  answer: number;
  explain: string;
  /** Optional standalone code snippet shown in its own LTR block. */
  code?: string;
}

const SYSTEM_PROMPT = `أنت مدرس عربي بيكتب اختبارات قصيرة (اختيار من متعدد) على أي موضوع.
أعد JSON فقط، بدون أي نص خارجه، بالشكل ده:
{"title":"عنوان الاختبار","questions":[{"q":"نص السؤال بالعربي","code":"الكود لو السؤال فيه كود (اختياري)","options":["أ","ب","ج","د"],"answer":0,"explain":"جملة تشرح ليه الإجابة صح"}]}

قواعد:
- 4 اختيارات لكل سؤال، كلها مختلفة، وواحد بس صح وanswer هو رقمه من 0 لـ 3.
- الاختيارات الغلط تكون قريبة ومنطقية (أخطاء شائعة)، مش واضحة الغلط.
- الأسئلة عربية فصحى مبسطة، وكل سؤال فكرة واحدة.
- أي كود أو سطر برمجي يتحط في حقل "code" منفصل عن نص السؤال، وممنوع خلط عربي وإنجليزي في نفس السطر: الشرح العربي في q و explain، والكود في code (أقصى 6 أسطر، كل سطر ≤ 60 حرف، وممنوع عربي جوه الكود إلا لو الناتج المطبوع). لو مفيش كود، امتنع عن الحقل خالص.
- الاختيارات نفسها ممكن تكون قيم أو رموز قصيرة (زي 20 أو x++) وده مسموح، لكن متحطش كود طويل في الاختيارات.
- نوّع بين فهم وتطبيق وحساب، وممنوع سؤالين بنفس الفكرة.
- explain جملة واحدة قصيرة (8-20 كلمة) توضّح الإجابة.
- ممنوع Markdown أو رموز تعبيرية أو أي كلام قبل JSON أو بعده.`;

function parseQuiz(text: string): { title: string; questions: Question[] } | null {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
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
  const record = payload as { title?: unknown; questions?: unknown };
  if (!Array.isArray(record.questions)) return null;

  const questions: Question[] = [];
  for (const raw of record.questions) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const q = typeof item.q === 'string' ? item.q.trim() : '';
    const explain = typeof item.explain === 'string' ? item.explain.trim() : '';
    const code =
      typeof item.code === 'string' ? item.code.trim().slice(0, 600) : '';
    const options = Array.isArray(item.options)
      ? item.options.filter((option): option is string => typeof option === 'string').map((o) => o.trim())
      : [];
    const answer = typeof item.answer === 'number' ? item.answer : Number(item.answer);
    if (!q || options.length !== 4 || options.some((option) => !option)) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    if (new Set(options).size !== 4) continue;
    questions.push({ q, options, answer, explain, ...(code ? { code } : {}) });
  }
  if (questions.length === 0) return null;
  return {
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'اختبار سريع',
    questions,
  };
}

export async function POST(req: NextRequest) {
  let body: QuizRequest;
  try {
    body = (await req.json()) as QuizRequest;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }

  const topic = body.topic?.trim();
  const count = Math.min(12, Math.max(3, Math.round(body.count ?? 5)));
  const difficulty = ['سهل', 'متوسط', 'صعب'].includes(body.difficulty ?? '')
    ? body.difficulty
    : 'متوسط';

  if (!topic || topic.length > 200) {
    return apiError('INVALID_REQUEST', 400, 'topic must be 1-200 characters');
  }

  try {
    const { model, thinkingConfig, serverManaged } = await resolveModelFromRequest(
      req,
      body,
      'quiz-generate',
    );

    const prompt = `الموضوع: ${topic}
المستوى: ${difficulty}
عدد الأسئلة: ${count}

اكتب الاختبار JSON الآن.`;

    const result = await callLLM(
      {
        model,
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 3_200,
        temperature: 0.4,
      },
      'quiz-generate',
      undefined,
      thinkingConfig ?? { effort: 'low' },
      { serverManaged },
    );

    const parsed = parseQuiz(result.text ?? '');
    if (!parsed) {
      log.warn(
        `Unusable quiz reply (chars=${(result.text ?? '').length}) [topic="${topic.slice(0, 50)}"]`,
      );
      return apiError(
        'QUIZ_UNPARSEABLE',
        502,
        'الموديل رجّع اختبار مش مفهوم — جرّب تولّد تاني.',
      );
    }

    return apiSuccess({
      title: parsed.title,
      questions: parsed.questions.slice(0, count),
    });
  } catch (error) {
    const authorization = modelAuthorizationResponse(error);
    if (authorization) return authorization;
    log.error(`Quiz generation failed [topic="${topic.slice(0, 50)}"]`, error);
    return apiError(
      'QUIZ_GENERATION_FAILED',
      502,
      'معلش، مقدرناش نولّد الاختبار دلوقتي — جرّب تاني.',
    );
  }
}
