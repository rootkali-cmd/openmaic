/**
 * Whiteboard lesson API — the "Teaching AI" stage of the engine.
 *
 * Pipeline: Student Question → this route (teaching model) → structured
 * Lesson { beats: [{ speech, draws }] } → validated against the Drawing DSL
 * → the client's player syncs speech with progressive rendering.
 *
 * The model only decides WHAT to teach and WHAT to draw. This route enforces
 * the schema; the renderer enforces the visuals; neither may inject code.
 */
import { NextRequest } from 'next/server';

import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import {
  apiError,
  apiSuccess,
  modelAuthorizationResponse,
} from '@/lib/server/api-response';
import { createLessonJob, finishLessonJob, readLessonJob } from '@/lib/server/lesson-jobs';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { BOARD_HEIGHT, BOARD_WIDTH } from '@/lib/whiteboard-engine/dsl';
import { parseLessonReply } from '@/lib/whiteboard-engine/lesson';

const log = createLogger('Whiteboard Lesson');

interface LessonRequest {
  question: string;
  /** Occupied board: where existing content ends, so the model avoids it. */
  existingBounds?: { x: number; y: number; w: number; h: number } | null;
  /** Recent question/title pairs, for conversational follow-ups. */
  history?: { question: string; title: string }[];
  locale?: string;
}

const SYSTEM_PROMPT = `أنت مدرس عربي على "سبورة دارس" — سبورة ذكية يرسم عليها المدرس باليد بينما يشرح بصوته.
مهمتك تحويل سؤال الطالب إلى درس: جمل منطوقة بالعربية الفصحى المبسطة + أوامر رسم تظهر في نفس لحظة كل جملة.

أعد JSON فقط، بدون أي نص خارجه، بهذا الشكل:
{"title": "عنوان قصير للدرس", "beats": [{"speech": "جملة ينطقها المدرس", "draws": [أمر رسم]}]}

قواعد الدرس:
- من 2 إلى 6 جمل (beats). كل جملة 12 إلى 45 كلمة، موجهة للطالب، تشرح خطوة واحدة فقط.
- كل beat يحمل 1 إلى 4 أوامر رسم تظهر تدريجياً أثناء نطق الجملة. اجعل آخر أمر في الجملة هو الذي يكمل الفكرة.
- لا تكرر نفس المعلومة في جملتين. لا تستخدم رموزاً توضيحية (emojis).
- الشرح صوتياً والرسم مختصر: اكتب على السبورة عناوين ومعادلات وجداول ورسوماً، لا فقرات.

نظام الإحداثيات: السبورة بعرض ${BOARD_WIDTH} وارتفاع ${BOARD_HEIGHT}، الصفر في الزاوية العليا اليسرى.
${'${PLACEMENT}'}

الألوان المتاحة: الحبر الداكن #3D315E (الافتراضي)، بنفسجي #5B3FC7، فاتح #9178E6، أصفر للتأكيد #FFD84D، أزرق #5FA0FC، أخضر #00C386، مرجاني #FB7E5B.
استخدم الأصفر فقط للتأكيد على أهم فكرة واحدة في الدرس.

أوامر الرسم المسموحة فقط (JSON مسطح، ممنوع أي JavaScript أو HTML أو صور):
- {"op":"TEXT","x":0-1000,"y":0-720,"text":"...","size":8-120,"color":"#...","weight":400|700,"anchor":"start"|"middle"|"end"}
- {"op":"MATH","x":..,"y":..,"latex":"F = m \\\\times a","size":..,"display":true}   (LaTeX فقط)
- {"op":"LINE","x1":..,"y1":..,"x2":..,"y2":..,"color":"#...","width":1-14,"style":"solid"|"dashed"|"dotted"}
- {"op":"ARROW","x1":..,"y1":..,"x2":..,"y2":..,"color":"#...","width":..,"curve":false,"double":false}
- {"op":"CIRCLE","cx":..,"cy":..,"r":..,"fill":"#...|none","stroke":"#...","strokeWidth":..,"label":"...","labelSize":..}
- {"op":"RECTANGLE","x":..,"y":..,"w":..,"h":..,"rx":..,"fill":"#...|none","stroke":"#...","strokeWidth":..,"label":"...","labelSize":..}
- {"op":"FLOWCHART","x":..,"y":..,"direction":"TB"|"LR","nodes":[{"id":"a","kind":"rect"|"diamond"|"ellipse"|"stadium","label":"..."}],"edges":[{"from":"a","to":"b","label":"..."}],"nodeW":150,"nodeH":68,"gap":64}
- {"op":"TABLE","x":..,"y":..,"headers":[".."],"rows":[[".."]],"width":620,"cellH":46,"headerFill":"#..."}
- {"op":"HIGHLIGHT","target":"id-لعنصر-سابق" | "region":{"x","y","w","h"},"mode":"wash"|"underline"|"box"|"circle","color":"#FFD84D"}
- {"op":"ERASE","target":"id"|"last"|"all"}
- {"op":"GROUP","ids":["id1","id2"],"dx":0,"dy":0}
- {"op":"MOVE","target":"id","dx":0,"dy":0}

إرشادات الرسم:
- املأ السبورة: ضع المحتوى داخل x من 60 إلى 940 و y من 60 إلى 660، والكتل المتجاورة بينها 40 إلى 70px فقط. لا تترك عنصراً وحيداً بعيداً في طرف السبورة.
- كل عنصر له مكانه: لا ترسم شكلين متداخلين، ولا تضع نصاً فوق سهم أو داخل شكل مخصص لشيء آخر. احسب ارتفاع كل كتلة وابدأ التالية تحتها.
- الشكل الواحد لا يزيد عن 420px عرضاً ولا 220px ارتفاعاً، حتى تبقى الرسوم متقاربة ومقروءة.
- عند رسم دورة أو علاقة، ضع العناصر مترابطة في منتصف السبورة واربطها بأسهم قصيرة واضحة، بحيث يبدأ السهم وينتهي خارج حدود العنصرين.
- HIGHLIGHT للتأكيد فقط: منطقة واحدة لا تزيد عن 600×200 حول سطر أو كتلة واحدة، وممنوع تلوين نصف السبورة أو أكثر.
- إذا أردت الإشارة لعنصر لاحقاً (HIGHLIGHT/MOVE/ERASE) فامنحه id إنجليزياً قصيراً وفرده، ولا تعد استخدام نفس ال id لعنصر جديد.
- FLOWCHART: من 2 إلى 6 عقد بـ ids إنجليزية قصيرة؛ التخطيط يُحسب تلقائياً فلا تقلق بترتيب العقد.
- المعادلات بالـ LaTeX داخل MATH بدلاً من كتابتها نصاً.
- لا تتجاوز حدود السبورة، واترك مسافة 40px بين الكتل المتجاورة.
- ابدأ الجملة الأولى بعنوان الدرس كـ TEXT كبير.

${'${EXAMPLE}'}`;

const EXAMPLE = `مثال (اختصره كما تريد):
{"title":"قانون نيوتن الثاني","beats":[
 {"speech":"قانون نيوتن الثاني بيقول إن القوة تساوي الكتلة في التسارع.","draws":[
   {"op":"TEXT","x":70,"y":80,"text":"قانون نيوتن الثاني","size":42,"weight":700},
   {"op":"HIGHLIGHT","region":{"x":60,"y":46,"w":420,"h":50},"mode":"wash"}]},
 {"speech":"نكتبها رياضياً: القوة تساوي الكتلة مضروبة في التسارع.","draws":[
   {"op":"MATH","x":120,"y":210,"latex":"F = m \\\\times a","size":52,"color":"#5B3FC7"}]},
 {"speech":"لو زاد التسارع زادت القوة، ولو زادت الكتلة احتاجت قوة أكبر.","draws":[
   {"op":"RECTANGLE","x":90,"y":320,"w":330,"h":140,"stroke":"#5B3FC7","label":"تسارع أكبر ← قوة أكبر","labelSize":21},
   {"op":"ARROW","x1":450,"y1":390,"x2":620,"y2":390,"color":"#9178E6","width":3},
   {"op":"CIRCLE","cx":740,"cy":390,"r":100,"stroke":"#5B3FC7","label":"F = ma","labelSize":24}]}
]}`;

export async function POST(req: NextRequest) {
  let body: LessonRequest;
  try {
    body = (await req.json()) as LessonRequest;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }

  const question = body.question?.trim();
  const questionSnippet = question?.substring(0, 60);

  if (!question || question.length > 600) {
    return apiError('INVALID_REQUEST', 400, 'question must be 1-600 characters');
  }

  try {
    const { model, serverManaged } = await resolveModelFromRequest(
      req,
      body,
      'whiteboard-lesson',
    );

    // Answer immediately with a job id: the teaching model can take longer
    // than the platform's request ceiling, so the work continues in-process
    // and the client polls. See lib/server/lesson-jobs.ts.
    const jobId = createLessonJob();
    void generateLesson(jobId, {
      question,
      existingBounds: body.existingBounds ?? null,
      history: body.history ?? [],
      questionSnippet,
      params: { model, serverManaged },
    });
    return apiSuccess({ jobId }, 202);
  } catch (error) {
    const authorization = modelAuthorizationResponse(error);
    if (authorization) return authorization;
    log.error(`Lesson job could not start [q="${questionSnippet ?? 'unknown'}..."]`, error);
    return apiError('INTERNAL_ERROR', 500, 'lesson job could not start');
  }
}

/** Poll a lesson job: `pending` until the model finishes, then the lesson. */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job');
  if (!jobId) return apiError('INVALID_REQUEST', 400, 'job is required');
  const state = readLessonJob(jobId);
  return apiSuccess({ ...state }, 200);
}

interface GenerateContext {
  question: string;
  existingBounds: LessonRequest['existingBounds'];
  history: NonNullable<LessonRequest['history']>;
  questionSnippet?: string;
  params: {
    model: Parameters<typeof callLLM>[0]['model'];
    serverManaged: boolean;
  };
}

async function generateLesson(jobId: string, ctx: GenerateContext): Promise<void> {
  const { question, existingBounds: bounds, history, questionSnippet, params } = ctx;
  try {
    // Placement guidance: never draw on top of an existing lesson.
    let placement =
      '- السبورة فارغة: وزّع المحتوى من الأعلى للأسفل تاركاً مساحة بين الكتل.';
    if (bounds && bounds.h > 0) {
      const belowY = Math.round(bounds.y + bounds.h + 50);
      placement =
        bounds.y + bounds.h < BOARD_HEIGHT - 260
          ? `- السبورة عليها محتوى سابق ينتهي عند y=${Math.round(bounds.y + bounds.h)}. ابدأ رسومك من y=${belowY} ونازل، وحافظ على x بين 40 و960.`
          : `- السبورة عليها محتوى سابق يشغل معظمها. ابدأ عموداً جديداً على اليمين من x=${Math.round(
              bounds.x + bounds.w + 60,
            )} و y=40، وضمن حدود السبورة.`;
    }

    const historyContext =
      history.length > 0
        ? `\nسياق المحادثة (أسئلة سابقة للطالب):\n${history
            .slice(-3)
            .map((h) => `- "${h.question}" → درس "${h.title}"`)
            .join('\n')}\nإذا كان السؤال الحالي متابعة له، فالحق الإجابة عليه ضمن الدرس نفسه.\n`
        : '';

    const system = SYSTEM_PROMPT.replace('${PLACEMENT}', placement).replace(
      '${EXAMPLE}',
      EXAMPLE,
    );

    const prompt = `${historyContext}سؤال الطالب: ${question}\n\nأعد الدرس JSON الآن.`;

    // The teaching model occasionally spends its entire output budget on
    // hidden reasoning and returns an empty body (finishReason "length").
    // Each attempt is bounded so two of them still fit inside the client's
    // wait; anything that stays unusable is reported honestly instead of
    // drawing a canned lesson that has nothing to do with the question.
    const runModel = (maxOutputTokens: number, timeoutMs: number) =>
      callLLM(
        {
          model: params.model,
          system,
          prompt,
          maxOutputTokens,
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
        'whiteboard-lesson',
        undefined,
        // This stage needs a short, well-formed JSON lesson, not a reasoning
        // essay: at the model's default effort the whole output budget goes to
        // hidden reasoning and the visible reply comes back empty.
        { effort: 'low' },
        { serverManaged: params.serverManaged },
      );

    // The model occasionally truncates its JSON, emits a malformed draw
    // object, or burns its whole window on hidden reasoning until the attempt
    // times out. All three are transient, so each attempt is bounded and the
    // next one starts while the student's window still has room; a canned
    // lesson would answer a different question.
    const ATTEMPT_DEADLINE_MS = 150_000;
    const budgets = [6_000, 16_000, 16_000];
    const startedAt = Date.now();
    let result: Awaited<ReturnType<typeof runModel>> | null = null;
    let parsed: ReturnType<typeof parseLessonReply> = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < budgets.length; attempt += 1) {
      const remaining = ATTEMPT_DEADLINE_MS - (Date.now() - startedAt);
      if (remaining < 25_000) break;
      try {
        result = await runModel(budgets[attempt], Math.min(100_000, remaining));
        parsed = parseLessonReply(result.text ?? '');
        if (parsed) break;
        log.warn(
          `Lesson reply unusable (finish=${result.finishReason ?? 'unknown'}, ` +
            `chars=${(result.text ?? '').length}), retrying ` +
            `[attempt ${attempt + 1}, q="${questionSnippet}..."]`,
        );
      } catch (error) {
        lastError = error;
        log.warn(
          `Lesson attempt ${attempt + 1} failed (${error instanceof Error ? error.message : 'unknown'}) ` +
            `[q="${questionSnippet}..."]`,
        );
      }
    }

    if (!parsed && result === null && lastError) throw lastError;

    if (parsed) {
      log.info(
        `Lesson generated [q="${questionSnippet}...", beats=${parsed.lesson.beats.length}, dropped=${parsed.dropped}]`,
      );
      finishLessonJob(jobId, {
        status: 'done',
        success: true,
        title: parsed.lesson.title,
        beats: parsed.lesson.beats,
        dropped: parsed.dropped,
        fallback: false,
      });
      return;
    }

    log.warn(
      `Model reply unparseable (finish=${result?.finishReason ?? 'unknown'}, ` +
        `chars=${(result?.text ?? '').length}, head=${JSON.stringify(
          (result?.text ?? '').slice(0, 160),
        )}) [q="${questionSnippet}..."]`,
    );
    finishLessonJob(jobId, {
      status: 'failed',
      code: 'LESSON_UNPARSEABLE',
      message: 'The teaching model returned an unusable lesson.',
    });
  } catch (error) {
    // Network/provider failure: report it. Drawing an unrelated canned lesson
    // here is worse than saying "I could not prepare that right now".
    log.error(`Whiteboard lesson failed [q="${questionSnippet ?? 'unknown'}..."]`, error);
    finishLessonJob(jobId, {
      status: 'failed',
      code: 'LESSON_UNAVAILABLE',
      message: 'The teaching model could not be reached.',
    });
  }
}