import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type JsonObject = Record<string, unknown>;

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

function json(data: JsonObject, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const authHeader = request.headers.get("Authorization");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !geminiApiKey) {
      return json({ error: "Study plan service is not configured." }, 500);
    }

    if (!authHeader) {
      return json({ error: "You must be signed in to continue." }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "You must be signed in to continue." }, 401);
    }

    const body = await readBody(request);
    const requestedSid = Number(body?.sid);

    const { data: student, error: studentError } = await adminClient
      .from("student")
      .select("sid, full_name, email, mls")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (studentError || !student) {
      return json({ error: "Student profile was not found." }, 404);
    }

    if (
      Number.isFinite(requestedSid) &&
      requestedSid > 0 &&
      Number(student.sid) !== requestedSid
    ) {
      return json({ error: "Student profile does not match this account." }, 403);
    }

    const [availabilityResult, coursesResult] = await Promise.all([
      adminClient
        .from("student_study_availability")
        .select("day_of_week, start_time, end_time")
        .eq("sid", student.sid)
        .order("availability_id", { ascending: true }),
      adminClient
        .from("student_course")
        .select(
          `
          progress_percent,
          completed,
          enrolled_at,
          course (
            cid,
            name,
            description,
            teachingstyle,
            level
          )
        `
        )
        .eq("sid", student.sid)
        .order("enrolled_at", { ascending: false }),
    ]);

    if (availabilityResult.error) {
      return json({ error: "Availability could not be loaded." }, 500);
    }

    if (coursesResult.error) {
      return json({ error: "Courses could not be loaded." }, 500);
    }

    const availability = availabilityResult.data || [];
    const enrolledCourses = (coursesResult.data || [])
      .filter((row) => row.course)
      .map((row) => ({
        courseId: row.course.cid,
        courseName: row.course.name,
        description: row.course.description || "",
        teachingStyle: row.course.teachingstyle || "",
        level: row.course.level || "",
        progressPercent: Number(row.progress_percent || 0),
        completed: Boolean(row.completed),
      }));

    if (availability.length === 0) {
      return json({ error: "Add at least one study time." }, 400);
    }

    if (enrolledCourses.length === 0) {
      return json({ error: "Enroll in a course before creating a study plan." }, 400);
    }

    const prompt = buildPrompt({
      student,
      availability,
      enrolledCourses,
    });
    const { plan, model } = await generatePlan(prompt, geminiApiKey);

    validateStudyPlan(plan);

    const { error: deleteError } = await adminClient
      .from("student_study_plan")
      .delete()
      .eq("sid", student.sid);

    if (deleteError) {
      return json({ error: "Old study plan could not be replaced." }, 500);
    }

    const { data: insertedPlan, error: insertError } = await adminClient
      .from("student_study_plan")
      .insert({
        sid: student.sid,
        plan_json: plan,
        model,
      })
      .select("plan_id, generated_at")
      .maybeSingle();

    if (insertError) {
      return json({ error: "Study plan could not be saved." }, 500);
    }

    return json({
      plan,
      planId: insertedPlan?.plan_id ?? null,
      generatedAt: insertedPlan?.generated_at ?? new Date().toISOString(),
      model,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Study plan could not be created.";
    return json({ error: message }, 500);
  }
});

async function readBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function buildPrompt({
  student,
  availability,
  enrolledCourses,
}: {
  student: Record<string, unknown>;
  availability: Array<Record<string, unknown>>;
  enrolledCourses: Array<Record<string, unknown>>;
}) {
  const cleanAvailability = availability.map((slot) => ({
    day: slot.day_of_week,
    startTime: normalizeTime(slot.start_time),
    endTime: normalizeTime(slot.end_time),
  }));

  return `
Create a weekly university study plan for this student.

Student:
${JSON.stringify(
  {
    sid: student.sid,
    fullName: student.full_name,
    learningStyle: student.mls,
  },
  null,
  2
)}

Available time slots:
${JSON.stringify(cleanAvailability, null, 2)}

Enrolled courses:
${JSON.stringify(enrolledCourses, null, 2)}

Rules:
- Use only the provided availability slots.
- Do not create study sessions outside the available time ranges.
- Prioritize courses with lower progressPercent.
- Do not include completed courses unless all courses are completed.
- Spread study sessions across the available days.
- Keep each study session realistic.
- Prefer 30, 45, 60, 90, or 120 minute sessions.
- Match activities to the student's learning style where possible.
- Return only valid JSON.
- Do not include markdown.
- Include every day from Monday to Sunday even if there are no sessions.

Required JSON structure:
{
  "summary": "string",
  "weeklyGoal": "string",
  "totalStudyHours": number,
  "studentLearningStyle": "string",
  "days": [
    {
      "day": "Monday",
      "sessions": [
        {
          "courseId": number,
          "courseName": "string",
          "startTime": "HH:MM",
          "endTime": "HH:MM",
          "durationMinutes": number,
          "activityType": "video | quiz | revision | notes | practice",
          "taskTitle": "string",
          "taskDescription": "string",
          "priority": "low | medium | high"
        }
      ]
    },
    { "day": "Tuesday", "sessions": [] },
    { "day": "Wednesday", "sessions": [] },
    { "day": "Thursday", "sessions": [] },
    { "day": "Friday", "sessions": [] },
    { "day": "Saturday", "sessions": [] },
    { "day": "Sunday", "sessions": [] }
  ],
  "tips": ["string"]
}
`;
}

async function generatePlan(prompt: string, apiKey: string) {
  const models = getModelCandidates();
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        const errorMessage =
          payload?.error?.message || `Gemini request failed: ${response.status}`;
        const error = new Error(errorMessage);

        if (shouldTryNextModel(response.status, errorMessage)) {
          lastError = error;
          continue;
        }

        throw error;
      }

      const text = extractCandidateText(payload);
      return {
        plan: parsePlanJson(text),
        model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldTryNextModel(0, lastError.message)) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Study plan service is unavailable.");
}

function getModelCandidates() {
  const configuredModels = [
    Deno.env.get("GEMINI_MODEL"),
    ...(Deno.env.get("GEMINI_MODEL_FALLBACKS") || "")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
  ].filter(Boolean) as string[];

  return [...new Set([...configuredModels, ...DEFAULT_GEMINI_MODELS])];
}

function shouldTryNextModel(status: number, message: string) {
  const cleanMessage = message.toLowerCase();

  return (
    status === 0 ||
    status === 400 ||
    status === 404 ||
    status === 429 ||
    status >= 500 ||
    [
      "unavailable",
      "resource_exhausted",
      "internal",
      "deadline_exceeded",
      "fetch failed",
      "network",
      "timeout",
      "timed out",
      "model not found",
      "high demand",
    ].some((pattern) => cleanMessage.includes(pattern))
  );
}

function extractCandidateText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : [];
  const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
  const content = firstCandidate?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) =>
      typeof (part as Record<string, unknown>).text === "string"
        ? ((part as Record<string, unknown>).text as string)
        : ""
    )
    .join("")
    .trim();

  if (!text) {
    throw new Error("Study plan service returned an empty response.");
  }

  return text;
}

function parsePlanJson(text: string) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("Study plan response was not valid JSON.");
  }

  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

function validateStudyPlan(plan: Record<string, unknown>) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.days)) {
    throw new Error("Study plan response was incomplete.");
  }

  const returnedDays = plan.days.map((day: Record<string, unknown>) => day.day);

  for (const day of DAYS) {
    if (!returnedDays.includes(day)) {
      throw new Error("Study plan response was incomplete.");
    }
  }

  for (const dayPlan of plan.days) {
    if (!Array.isArray((dayPlan as Record<string, unknown>).sessions)) {
      throw new Error("Study plan response was incomplete.");
    }
  }
}

function normalizeTime(value: unknown) {
  return value ? String(value).slice(0, 5) : "";
}
