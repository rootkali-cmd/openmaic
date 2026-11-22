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
import { getModel, parseModelString } from '@/lib/ai/providers';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, modelAuthorizationResponse } from '@/lib/server/api-response';
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
  /** Photo/screenshot attached by the student; the teaching model reads it. */
  image?: { dataUrl: string; name?: string };
}

const SYSTEM_PROMPT = `أنت مدرس عربي على "سبورة دارس" — سبورة ذكية يكتب ويرسم عليها المدرس بيده بينما يشرح بصوته.
مهمتك تحويل سؤال الطالب إلى درس قصير ومحدد: جمل منطوقة بالعربية الفصحى المبسطة + أوامر رسم تظهر في نفس لحظة كل جملة.

أعد JSON فقط، بدون أي نص خارجه، بهذا الشكل:
{"title": "عنوان قصير للدرس", "beats": [{"speech": "جملة ينطقها المدرس", "draws": [أمر رسم]}]}

قواعد الشرح:
- من 3 إلى 5 خطوات. كل خطوة جملة واحدة من 12 إلى 30 كلمة، تشرح فكرة واحدة وتضيف معلومة جديدة.
- ابدأ من حياة الطالب: مثال محسوس أو سؤال، ثم القاعدة، ثم مثال يثبتها. استخدم أرقاماً حقيقية (كثافة الحديد 7.8 جم/سم³، كثافة الماء 1 جم/سم³، كثافة الهواء 0.0012 جم/سم³).
- خصّص الشرح للسؤال نفسه: لا تعريف عام، ولا تكرر نص السؤال كعنوان. العنوان يضيف معنى، مثال: "ليه الحديد يغرق والفلين يطفو؟".
- لا تكرر معلومة في خطوتين، ولا تستخدم رموزاً تعبيرية (emojis).
- الجملة تُنطق بصوت المدرس: اكتبها كلاماً طبيعياً، لا عناوين ولا نقاط.

قواعد السبورة (مهمة):
- السبورة زي كشكول المدرس: عنوان كبير، وأسطر قصيرة مكتوبة بخط اليد، ومعادلة أو شكل واحد لما تحتاجه فقط.
- كل خطوة فيها من عنصر واحد إلى 3 عناصر، وارتفاعها الكلي لا يزيد عن 240px.
- ممنوع أكثر من شكل واحد (RECTANGLE / CIRCLE / FLOWCHART / TABLE) في الخطوة الواحدة.
- الشكل له وظيفة فقط: تحويط مثال، سهم بين سبب ونتيجة، جدول مقارنة من صفين أو ثلاثة، أو مخطط من 3 عقد بحد أقصى.
- أي RECTANGLE أو CIRCLE لازم يكون له label مفيد أو يحتوي سطر TEXT جواه؛ الشكل الفاضي بيتشال تلقائياً ومش بيظهر.
- ممنوع الرسم الزينة: ممنوع مستطيل أو دائرة بدون label أو بدون وظيفة واضحة، وممنوع تعبئة لون خلفية أو شريط ملوّن تحت الدرس.
- التأكيد بـ HIGHLIGHT بالـ target فقط و mode "underline" على عنصر له id؛ ممنوع region wash/box (بتطلع مستطيلات في غير مكانها).
- التخطيط النهائي يُرتّب تلقائياً من فوق لتحت، فضع عناصر الخطوة الواحدة متقاربة، ولا تحاول ملء السبورة.
- أي عملية أو خطوات أو خوارزمية: ابدأ بخريطة/روود ماب في أول خطوة (FLOWCHART من 3 عقد، أو 3 أسطر TEXT مرقمة: 1 ثم 2 ثم 3)، وبعدها ادخل في التفاصيل. ممنوع تبدأ بالكود أو بالتفاصيل على طول.
- لونان فقط: الحبر الداكن #3D315E للشرح، ولون واحد للتأكيد (#FFD84D أو #5B3FC7).

نظام الإحداثيات: السبورة بعرض ${BOARD_WIDTH} وارتفاع ${BOARD_HEIGHT}، الصفر في الزاوية العليا اليسرى.
${'${PLACEMENT}'}

الألوان المتاحة: الحبر الداكن #3D315E (الافتراضي)، بنفسجي #5B3FC7، فاتح #9178E6، أصفر للتأكيد #FFD84D، أزرق #5FA0FC، أخضر #00C386، مرجاني #FB7E5B.

أوامر الرسم المسموحة فقط (JSON مسطح، ممنوع أي JavaScript أو HTML أو صور):
- {"op":"TEXT","x":0-1000,"y":0-720,"text":"...","size":8-120,"color":"#...","weight":400|700,"anchor":"start"|"middle"|"end"}   (نص عربي فقط، ممنوع كود جواه)
- {"op":"CODE","x":0-1000,"y":0-720,"text":"سطر كود واحد","size":12-38,"tone":"plain"|"input"|"output"|"comment","lang":"python"|"javascript"|"c"|"cpp"|"java"|"html"|"css"|"other"}   (سطر كود واحد فقط، LTR، وممنوع عربي جواه غير لو جملة المُخرجات المطبوعة)
- {"op":"MATH","x":..,"y":..,"latex":"F = m \\\\times a","size":..,"display":true}   (LaTeX فقط، وبكل أوامر LaTeX اكتب شرطتين مائلتين: \\\\frac \\\\sqrt)
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
- الخطوة الأولى: عنوان الدرس TEXT بحجم 40-52، وتحته سطر واحد 24-28 يوضح الفكرة.
- أسطر النص بحجم 22-30، سطر واحد لكل فكرة، بلا فقرات طويلة.
- المعادلات بالـ LaTeX داخل MATH بدلاً من كتابتها نصاً، وكل أمر LaTeX بشرطتين مائلتين في JSON: \\frac و \\rho و \\sqrt (شرطة واحدة تجعل الـ JSON غير صالح).
- الشكل الواحد لا يزيد عن 380px عرضاً ولا 200px ارتفاعاً.
- HIGHLIGHT للتأكيد فقط: منطقة صغيرة حول سطر أو كلمة (أقصى 420×90)، وممنوع تلوين نصف السبورة.
- إذا أردت الإشارة لعنصر لاحقاً (HIGHLIGHT/MOVE/ERASE) فامنحه id إنجليزياً قصيراً وفرده في نفس الخطوة، ولا تعد استخدام نفس ال id.
- لا ترسم خطاً أو سهماً يمر فوق نص.

قواعد دروس البرمجة (لما السؤال فيه كود أو لغة برمجة أو سؤال عن برنامج):
- افصل الكود عن العربي تماماً: كل سطر كود في أمر CODE لوحده على سطر مستقل، وأي شرح عربي في TEXT في سطر تاني (فوقه أو تحته). ممنوع خلط كود وعربي في نفس الأمر أو نفس السطر.
- ممنوع سطر جديد أو أكثر من سطر داخل أمر CODE؛ لو عندك 3 أسطر كود اكتب 3 أوامر CODE منفصلة.
- الكود بالإنجليزي LTR: الأسماء والرموز إنجليزي. ممنوع أي حرف عربي داخل CODE (لا في اسم متغير ولا تعليق) إلا لو البرنامج بيطبع جملة عربية، وساعتها حطها لوحدها في CODE بـ tone:"output".
- لو البرنامج بيطبع جملة عربية، خليها في CODE لوحدها بـ tone:"output" (أو tone:"input" لو هي مُدخل)، والشرح العربي يبقى في speech و TEXT منفصل.
- لو السؤال عن برنامج أو عملية: ابدأ بـ roadmap في أول خطوتين: FLOWCHART من 3 عقد (المدخل → المعالجة → المخرج) أو 3 أسطر TEXT مرقمة، وبعدها ادخل في التفاصيل. ممنوع تقفز للكود على طول.
- اشرح الكود سطر بسطر: كل خطوة فيها 1-3 أسطر CODE فقط، والـ speech يشرح وظيفة السطر ونتيجته بالعربي، وتحت الكود سطر TEXT عربي واحد (22-26px) يوضح "ليه السطر موجود".
- وضّح المخرجات في CODE بـ tone:"output" (أو جدول صغير لو النتيجة متعددة).
- الكود قصير ومقروء: كل سطر ≤ 58 حرف، وحجم CODE من 20 إلى 24، وأقصى 6 أسطر كود في الخطوة.
- غطّي الشرح كامل: هدف البرنامج، ثم خطواته، ثم كل سطر، ثم المخرجات، ثم خطأ شائع لو موجود (استخدم 5 إلى 7 خطوات).
- متكتبش نفس سطر الكود مرتين، وممنوع تحوّل الكود لمعادلة أو MATH.

${'${EXAMPLE}'}`;

const EXAMPLE = `مثال (اتبع نفس الأسلوب، وغيّر المحتوى حسب السؤال):
{"title":"ليه الحديد يغرق والفلين يطفو؟","beats":[
 {"speech":"خد بالك من حاجة غريبة: مكعب حديد صغير بيغرق، ومكعب فلين أكبر منه بيطفو. إزاي؟","draws":[
   {"op":"TEXT","x":70,"y":80,"text":"ليه الحديد يغرق والفلين يطفو؟","size":42,"weight":700},
   {"op":"TEXT","x":70,"y":130,"text":"نفس الحجم... ونتيجة مختلفة","size":24,"color":"#5B3FC7"}]},
 {"speech":"السبب إن كل مادة ليها كثافة: قد إيه كتلة في كل سنتيمتر مكعب. كثافة الحديد 7.8، والفلين 0.24.","draws":[
   {"op":"TABLE","id":"t1","x":150,"y":230,"headers":["المادة","الكثافة (جم/سم³)"],"rows":[["حديد","7.8"],["ماء","1.0"],["فلين","0.24"]],"width":420,"cellH":46},
   {"op":"HIGHLIGHT","target":"t1","mode":"underline","color":"#FFD84D"}]},
 {"speech":"فلما نحط الجسم في الماء، الكثافة بتقرر مصيره: لو أعلى من الماء يغرق، ولو أقل يطفو.","draws":[
   {"op":"MATH","x":200,"y":470,"latex":"\\\\rho = \\\\frac{m}{V}","size":44},
   {"op":"TEXT","x":200,"y":540,"text":"ρ أكبر من 1 → يغرق    ρ أقل من 1 → يطفو","size":24}]},
 {"speech":"وعشان كده السفينة من حديد بس بتطفو: جسمها مجوف وفيه هوا، فكثافتها الكلية أقل من كثافة الماء.","draws":[
   {"op":"TEXT","x":120,"y":620,"text":"السفينة: حديد + هوا = كثافة أقل من الماء","size":26,"color":"#3D315E"}]}
]}

مثال تاني لسؤال برمجة (اتبع نفس الأسلوب: خطة ثم كود سطر بسطر ثم المخرجات):
{"title":"print: إزاي بيطبع على الشاشة؟","beats":[
 {"speech":"سؤال النهارده: إزاي دالة الطباعة بتوصّل الكلام من البرنامج للشاشة؟","draws":[
   {"op":"TEXT","x":80,"y":80,"text":"إزاي print بتطبع؟","size":40,"weight":700},
   {"op":"TEXT","x":80,"y":132,"text":"مدخل → معالجة → مخرج","size":24,"color":"#5B3FC7"}]},
 {"speech":"قبل الكود، دي خطة البرنامج في تلات خطوات: خد النص، جهّزه للطباعة، وطلّعه على الشاشة.","draws":[
   {"op":"FLOWCHART","x":130,"y":240,"direction":"LR","nodes":[{"id":"a","kind":"stadium","label":"النص"},{"id":"b","kind":"rect","label":"تجهيز الطباعة"},{"id":"c","kind":"stadium","label":"الشاشة"}],"edges":[{"from":"a","to":"b"},{"from":"b","to":"c"}],"nodeW":150,"nodeH":60,"gap":56},
   {"op":"TEXT","x":130,"y":430,"text":"الخطة: النص → التجهيز → العرض","size":24}]},
 {"speech":"السطر الوحيد في البرنامج بيطلب من الدالة تطبع النص اللي بين القوسين، والفاصلة المنقوطة بتقفل السطر.","draws":[
   {"op":"CODE","x":110,"y":240,"text":"print('Hello')","size":24,"tone":"plain","lang":"python"},
   {"op":"TEXT","x":110,"y":300,"text":"القوسين فيهما النص المطلوب طباعته","size":24},
   {"op":"TEXT","x":110,"y":350,"text":"وسطر الكود ينتهي بلا فاصلة منقوطة في بايثون","size":24}]},
 {"speech":"لما نشغّل البرنامج، اللي بين القوسين بيظهر على الشاشة زي ما هو.","draws":[
   {"op":"TEXT","x":110,"y":240,"text":"المُخرج على الشاشة:","size":24,"color":"#3D315E"},
   {"op":"CODE","x":110,"y":310,"text":"Hello","size":24,"tone":"output"}]},
 {"speech":"وخد بالك من الأخطاء الشائعة: لو النص مش بين علامتي تنصيص، بايثون هيفتكره اسم متغير ومش هيطبعه.","draws":[
   {"op":"CODE","x":110,"y":240,"text":"print(Hello)","size":24,"tone":"plain"},
   {"op":"TEXT","x":110,"y":300,"text":"غلط: النص محتاج علامات تنصيص","size":24,"color":"#FB7E5B"},
   {"op":"CODE","x":110,"y":360,"text":"print('Hello')","size":24,"tone":"plain"},
   {"op":"TEXT","x":110,"y":420,"text":"صح: النص بين علامتي تنصيص","size":24,"color":"#00C386"}]}
]}`;

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

/** Only a real inline image, bounded so the route body stays sane. */
function cleanImage(raw: LessonRequest['image']): { dataUrl: string; name?: string } | null {
  if (!raw || typeof raw.dataUrl !== 'string') return null;
  const dataUrl = raw.dataUrl.trim();
  if (!DATA_IMAGE.test(dataUrl)) return null;
  // ~6 MB of binary: enough for a phone photo, small enough for one request.
  if (dataUrl.length > 8_000_000) return null;
  return {
    dataUrl,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : undefined,
  };
}

export async function POST(req: NextRequest) {
  let body: LessonRequest;
  try {
    body = (await req.json()) as LessonRequest;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'invalid JSON body');
  }

  const rawQuestion = body.question?.trim() ?? '';
  const image = body.image ? cleanImage(body.image) : null;
  if (body.image && !image) {
    return apiError('INVALID_REQUEST', 400, 'image must be a data:image URL under 8MB');
  }
  if (!rawQuestion && !image) {
    return apiError('INVALID_REQUEST', 400, 'question must be 1-600 characters');
  }
  if (rawQuestion.length > 600) {
    return apiError('INVALID_REQUEST', 400, 'question must be 1-600 characters');
  }
  const question = rawQuestion || 'اشرح المسألة أو الرسم الموجود في الصورة خطوة بخطوة.';
  const questionSnippet = question.substring(0, 60);

  try {
    const { model, serverManaged } = await resolveModelFromRequest(req, body, 'whiteboard-lesson');

    // Answer immediately with a job id: the teaching model can take longer
    // than the platform's request ceiling, so the work continues in-process
    // and the client polls. See lib/server/lesson-jobs.ts.
    const jobId = createLessonJob();
    void generateLesson(jobId, {
      question,
      existingBounds: body.existingBounds ?? null,
      history: body.history ?? [],
      questionSnippet,
      image,
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
  image?: { dataUrl: string; name?: string } | null;
  params: {
    model: Parameters<typeof callLLM>[0]['model'];
    serverManaged: boolean;
  };
}

async function generateLesson(jobId: string, ctx: GenerateContext): Promise<void> {
  const { question, existingBounds: bounds, history, questionSnippet, image, params } = ctx;
  try {
    // Placement guidance: the board layout is computed on the server (see
    // layoutBeats), so the model is told what is already on the paper and
    // nothing about coordinates it cannot control.
    const placement =
      bounds && bounds.h > 0
        ? `- السبورة عليها شرح سابق ينتهي عند y=${Math.round(bounds.y + bounds.h)}. درسك سيُرسم أسفله تلقائياً: لا تكرر ما سبق ولا تشير إليه كأنه غير موجود.`
        : '- السبورة فارغة: ابدأ بعنوان الدرس، ثم فكرة واحدة تحت الأخرى.';

    const historyContext =
      history.length > 0
        ? `\nسياق المحادثة (أسئلة سابقة للطالب):\n${history
            .slice(-3)
            .map((h) => `- "${h.question}" → درس "${h.title}"`)
            .join('\n')}\nإذا كان السؤال الحالي متابعة له، فالحق الإجابة عليه ضمن الدرس نفسه.\n`
        : '';

    // A reply that arrives on an interrupted board must land below the
    // lesson already written there, never on top of it.
    const layoutStartY = bounds && bounds.h > 0 ? bounds.y + bounds.h + 40 : undefined;

    const system = SYSTEM_PROMPT.replace('${PLACEMENT}', placement).replace('${EXAMPLE}', EXAMPLE);

    const prompt = `${historyContext}${
      image
        ? `الصورة المرفقة فيها السؤال أو الرسم أو المعادلة. اقرأ محتواها بدقة وابنِ الدرس على اللي فيها بالتحديد، مش على كلام عام.\n\n`
        : ''
    }سؤال الطالب: ${question}\n\nأعد الدرس JSON الآن.`;

    // The teaching model occasionally spends its entire output budget on
    // hidden reasoning and returns an empty body (finishReason "length").
    // Each attempt is bounded so two of them still fit inside the client's
    // wait; anything that stays unusable is reported honestly instead of
    // drawing a canned lesson that has nothing to do with the question.
    const runModel = (maxOutputTokens: number, signal: AbortSignal, model = params.model) =>
      callLLM(
        {
          model,
          system,
          ...(image
            ? {
                messages: [
                  {
                    role: 'user' as const,
                    content: [
                      { type: 'text' as const, text: prompt },
                      { type: 'image' as const, image: image.dataUrl },
                    ],
                  },
                ],
              }
            : { prompt }),
          maxOutputTokens,
          abortSignal: signal,
        },
        'whiteboard-lesson',
        undefined,
        // This stage needs a short, well-formed JSON lesson, not a reasoning
        // essay: at the model's default effort the whole output budget goes to
        // hidden reasoning and the visible reply comes back empty.
        { effort: 'low' },
        // A hedge model is named by this server, not by the request, but it
        // carries no fallback chain of its own.
        { serverManaged: model === params.model && params.serverManaged },
      );

    // Waiting is the whole cost of this stage: the provider can answer the
    // same question in five seconds or in thirty, and the board stays empty
    // until it does. Waiting for a failed attempt before starting the next one
    // made that worse. So the attempts are *hedged*: a second attempt starts
    // alongside the first after a short grace period, on a different model,
    // and the first usable lesson wins and cancels the rest.
    const HEDGE_AFTER_MS = 8_000;
    const WINDOW_MS = 150_000;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), WINDOW_MS);

    // Racing a second provider is what turns a stalled provider into a slow
    // answer instead of no answer. It is optional: without a key the primary
    // model simply gets a second attempt of its own. The hedge model reads
    // text only, so an attached image stays on the vision-capable primary.
    const altId = (
      process.env.WHITEBOARD_HEDGE_MODEL ?? 'openrouter:deepseek/deepseek-v4-flash-0731'
    ).trim();
    const altKey = process.env.OPENROUTER_API_KEY?.trim();
    let altModel: typeof params.model | null = null;
    if (!image && altKey && altId) {
      try {
        const { providerId, modelId } = parseModelString(altId);
        altModel = getModel({ providerId, modelId, apiKey: altKey }).model;
      } catch (error) {
        log.warn(`Hedge model unavailable (${altId})`, error);
      }
    }

    const state: {
      parsed: ReturnType<typeof parseLessonReply>;
      sawText: boolean;
      lastError: unknown;
    } = { parsed: null, sawText: false, lastError: null };

    // Resolves as soon as a lesson is in hand. Without it the request waits
    // for the unused hedge timers to elapse, which added ten seconds to every
    // question even though the lesson had already arrived.
    let won: (() => void) | null = null;
    const winner = new Promise<void>((resolve) => {
      won = resolve;
    });

    const attempt = async (
      budget: number,
      model: typeof params.model,
      label: string,
    ): Promise<void> => {
      const startedAt = Date.now();
      try {
        const result = await runModel(budget, controller.signal, model);
        log.info(
          `Lesson attempt ${label} answered in ${Date.now() - startedAt}ms ` +
            `(finish=${result.finishReason ?? 'unknown'}, chars=${(result.text ?? '').length})`,
        );
        if (state.parsed) return;
        state.sawText = true;
        const parsed = parseLessonReply(result.text ?? '', { startY: layoutStartY });
        if (parsed) {
          state.parsed = parsed;
          // Everything else in flight is now wasted work and wasted tokens.
          controller.abort();
          won?.();
          return;
        }
        log.warn(
          `Lesson reply unusable (finish=${result.finishReason ?? 'unknown'}, ` +
            `chars=${(result.text ?? '').length}) [q="${questionSnippet}..."]`,
        );
      } catch (error) {
        if (state.parsed) return;
        state.lastError = error;
        log.warn(
          `Lesson attempt ${label} failed after ${Date.now() - startedAt}ms ` +
            `(${error instanceof Error ? error.message : 'unknown'}) [q="${questionSnippet}..."]`,
        );
      }
    };

    const hedge = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    try {
      await Promise.race([
        Promise.all([
          attempt(6_000, params.model, 'primary'),
          hedge(HEDGE_AFTER_MS).then(() =>
            state.parsed
              ? undefined
              : attempt(8_000, altModel ?? params.model, altModel ? 'hedge' : 'primary-2'),
          ),
          hedge(HEDGE_AFTER_MS * 2).then(() =>
            state.parsed ? undefined : attempt(16_000, params.model, 'primary-3'),
          ),
        ]),
        winner,
      ]);
    } finally {
      clearTimeout(deadline);
    }

    const parsed = state.parsed;
    if (!parsed && !state.sawText && state.lastError) throw state.lastError;

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

    log.warn(`Model reply unparseable after every attempt [q="${questionSnippet}..."]`);
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
