import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { generateContentWithFallback } from "./geminiFallback.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

if (!geminiApiKey) {
  throw new Error("Missing GEMINI_API_KEY environment variable.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

async function generateStudentStudyPlan(sid) {
  console.log(`Generating study plan for student ID: ${sid}`);

  const student = await loadStudent(sid);
  const availability = await loadAvailability(sid);
  const enrolledCourses = await loadEnrolledCourses(sid);

  if (!student) {
    throw new Error(`Student not found for sid: ${sid}`);
  }

  if (!availability.length) {
    throw new Error("No study availability found for this student.");
  }

  if (!enrolledCourses.length) {
    throw new Error("No enrolled courses found for this student.");
  }

  const prompt = buildPrompt({
    student,
    availability,
    enrolledCourses,
  });

  const { response, model } = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;

  if (!text) {
    throw new Error("Gemini returned empty response.");
  }

  let planJson;

  try {
    planJson = JSON.parse(text);
  } catch {
    console.error("Raw Gemini response:", text);
    throw new Error("Gemini returned invalid JSON.");
  }

  validateStudyPlan(planJson);

  await saveStudyPlan({
    sid,
    planJson,
    model,
  });

  console.log(`Study plan generated successfully using model: ${model}`);
  return planJson;
}

async function loadStudent(sid) {
  const { data, error } = await supabase
    .from("student")
    .select("sid, full_name, email, mls")
    .eq("sid", sid)
    .single();

  if (error) {
    throw new Error(`Failed to load student: ${error.message}`);
  }

  return data;
}

async function loadAvailability(sid) {
  const { data, error } = await supabase
    .from("student_study_availability")
    .select("day_of_week, start_time, end_time")
    .eq("sid", sid)
    .order("availability_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load availability: ${error.message}`);
  }

  return data || [];
}

async function loadEnrolledCourses(sid) {
  const { data, error } = await supabase
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
    .eq("sid", sid)
    .order("enrolled_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load enrolled courses: ${error.message}`);
  }

  return (data || [])
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
}

function buildPrompt({ student, availability, enrolledCourses }) {
  const cleanAvailability = availability.map((slot) => ({
    day: slot.day_of_week,
    startTime: normalizeTime(slot.start_time),
    endTime: normalizeTime(slot.end_time),
  }));

  const cleanCourses = enrolledCourses.map((course) => ({
    courseId: course.courseId,
    courseName: course.courseName,
    description: course.description,
    teachingStyle: course.teachingStyle,
    level: course.level,
    progressPercent: course.progressPercent,
    completed: course.completed,
  }));

  return `
You are an academic study planner for a university e-learning platform.

Create a personalized weekly study plan for the student.

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
${JSON.stringify(cleanCourses, null, 2)}

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
- Use the exact same JSON structure every time.
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
    {
      "day": "Tuesday",
      "sessions": []
    },
    {
      "day": "Wednesday",
      "sessions": []
    },
    {
      "day": "Thursday",
      "sessions": []
    },
    {
      "day": "Friday",
      "sessions": []
    },
    {
      "day": "Saturday",
      "sessions": []
    },
    {
      "day": "Sunday",
      "sessions": []
    }
  ],
  "tips": [
    "string"
  ]
}
`;
}

function normalizeTime(time) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

function validateStudyPlan(planJson) {
  if (!planJson || typeof planJson !== "object") {
    throw new Error("Generated study plan is not an object.");
  }

  if (!Array.isArray(planJson.days)) {
    throw new Error("Generated study plan is missing days array.");
  }

  const returnedDays = planJson.days.map((day) => day.day);

  for (const day of DAYS) {
    if (!returnedDays.includes(day)) {
      throw new Error(`Generated study plan is missing ${day}.`);
    }
  }

  for (const dayPlan of planJson.days) {
    if (!Array.isArray(dayPlan.sessions)) {
      throw new Error(`${dayPlan.day} sessions must be an array.`);
    }
  }
}

async function saveStudyPlan({ sid, planJson, model }) {
  const { error: deleteError } = await supabase
    .from("student_study_plan")
    .delete()
    .eq("sid", sid);

  if (deleteError) {
    throw new Error(`Failed to delete old study plan: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase
    .from("student_study_plan")
    .insert({
      sid,
      plan_json: planJson,
      model,
    });

  if (insertError) {
    throw new Error(`Failed to save study plan: ${insertError.message}`);
  }
}

const sidArg = process.argv[2];

if (!sidArg) {
  console.error("Usage: node generateStudentStudyPlan.js <sid>");
  process.exit(1);
}

generateStudentStudyPlan(Number(sidArg))
  .then((plan) => {
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Study plan generation failed:", error.message);
    process.exit(1);
  });
