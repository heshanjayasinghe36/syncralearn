import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { generateContentWithFallback } from "./geminiFallback.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, ".env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const INSIGHTS_TABLE =
  process.env.TEACHER_INSIGHTS_TABLE || "teacher_course_insights";
const SKIP_BIN_SECONDS = Number(process.env.TEACHER_INSIGHTS_BIN_SECONDS || 15);
const EVENT_LIMIT = Number(process.env.TEACHER_INSIGHTS_EVENT_LIMIT || 5000);
const SEGMENT_LIMIT = Number(process.env.TEACHER_INSIGHTS_SEGMENT_LIMIT || 5000);
const RAW_ANALYTICS_CLEANUP_DISABLED = ["false", "0", "no"].includes(
  String(process.env.TEACHER_INSIGHTS_CLEANUP_RAW || "").toLowerCase()
);

const args = process.argv.slice(2);

function getArgValue(name) {
  const prefix = `--${name}=`;
  const inlineArg = args.find((arg) => arg.startsWith(prefix));

  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  const argIndex = args.findIndex((arg) => arg === `--${name}`);
  return argIndex >= 0 ? args[argIndex + 1] : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function shouldCleanupRawAnalytics() {
  if (hasFlag("keep-raw")) {
    return false;
  }

  if (hasFlag("cleanup-raw")) {
    return true;
  }

  return !RAW_ANALYTICS_CLEANUP_DISABLED;
}

function cleanJson(text) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("Gemini did not return a JSON object.");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

async function generateTeacherInsights() {
  validateEnvironment();

  const courses = await fetchCourses();

  if (courses.length === 0) {
    console.log("No courses found for insight generation.");
    return;
  }

  if (hasFlag("cleanup-only")) {
    await cleanupRawVideoAnalyticsForCourses(courses);
    return;
  }

  console.log(
    shouldCleanupRawAnalytics()
      ? "Raw video analytics cleanup is enabled after each saved insight."
      : "Raw video analytics cleanup is disabled for this run."
  );

  for (const course of courses) {
    console.log(`Generating insights for course ${course.cid}: ${course.name}`);

    try {
      const metrics = await buildCourseAnalytics(course);

      if (metrics.enrollment.enrolledStudents === 0) {
        console.log(`Course ${course.cid} has no enrolled students. Skipped.`);
        continue;
      }

      const { insight, model } = await askGeminiForInsights(metrics);
      await storeInsight(course, metrics, insight, model);
      await cleanupRawVideoAnalytics(metrics);

      console.log(`Stored insights for course ${course.cid} using ${model}.`);
    } catch (error) {
      console.error(`Course ${course.cid} failed: ${error.message}`);
    }
  }
}

function validateEnvironment() {
  const missing = [
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["GEMINI_API_KEY", process.env.GEMINI_API_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  validatePrivilegedSupabaseKey();
}

function validatePrivilegedSupabaseKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is currently a publishable key. Use a Supabase secret/service-role key for cleanup deletes."
    );
  }

  if (key.startsWith("sb_anon_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is currently an anon key. Use a Supabase secret/service-role key for cleanup deletes."
    );
  }
}

async function fetchCourses() {
  const courseId = getArgValue("course");
  const teacherId = getArgValue("teacher");

  let query = supabase
    .from("course")
    .select("cid, name, description, teachingstyle, amount, tid, level, status")
    .order("cid", { ascending: true });

  if (courseId) {
    query = query.eq("cid", courseId);
  }

  if (teacherId) {
    query = query.eq("tid", teacherId);
  }

  if (hasFlag("active-only")) {
    query = query.ilike("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function buildCourseAnalytics(course) {
  const lessons = await fetchRows(
    supabase
      .from("lesson")
      .select("lid, name, summary, number")
      .eq("cid", course.cid)
      .order("number", { ascending: true }),
    "lessons"
  );
  const lessonIds = lessons.map((lesson) => lesson.lid).filter(Boolean);

  const [videos, materials, quizzes, enrollments] = await Promise.all([
    fetchByLessonIds(
      "video",
      "vid, name, description, url, lid",
      lessonIds,
      "videos"
    ),
    fetchByLessonIds("material", "maid, name, file, lid", lessonIds, "materials"),
    fetchByLessonIds(
      "quize",
      "qid, name, lid, pass_threshold",
      lessonIds,
      "quizzes"
    ),
    fetchRows(
      supabase
        .from("student_course")
        .select(
          "sid, progress_percent, completed, enrolled_at, last_accessed_at"
        )
        .eq("cid", course.cid),
      "enrollments"
    ),
  ]);

  const videoIds = videos.map((video) => video.vid).filter(Boolean);
  const quizIds = quizzes.map((quiz) => quiz.qid).filter(Boolean);

  const [
    studentVideos,
    videoEvents,
    videoSegments,
    studentQuizzes,
  ] = await Promise.all([
    fetchByIds(
      "student_video",
      "sid, vid, duration_seconds, last_position_seconds, watched_seconds, completion_percent, completed, play_count, pause_count, seek_count, replay_count, last_watched_at",
      "vid",
      videoIds,
      "student video progress"
    ),
    fetchByIds(
      "student_video_events",
      "sid, vid, event_type, from_second, to_second, position_second, watched_delta_seconds, created_at",
      "vid",
      videoIds,
      "student video events",
      EVENT_LIMIT
    ),
    fetchByIds(
      "student_video_segments",
      "sid, vid, start_second, end_second, watch_count",
      "vid",
      videoIds,
      "student video segments",
      SEGMENT_LIMIT
    ),
    fetchByIds(
      "student_quize",
      "sid, qid, grade, status, passed, completed_at, time",
      "qid",
      quizIds,
      "student quiz attempts"
    ),
  ]);

  const lessonMetrics = buildLessonMetrics({
    lessons,
    videos,
    materials,
    quizzes,
    studentVideos,
    studentQuizzes,
  });

  return {
    generatedAt: new Date().toISOString(),
    course: {
      cid: course.cid,
      tid: course.tid,
      name: course.name,
      description: course.description || "",
      level: course.level || "",
      status: course.status || "",
      teachingstyle: course.teachingstyle || "",
      amount: Number(course.amount || 0),
    },
    enrollment: buildEnrollmentMetrics(enrollments),
    lessons: lessonMetrics,
    videos: buildVideoMetrics(videos, studentVideos, videoEvents, videoSegments),
    materials: buildMaterialMetrics(materials),
    quizzes: buildQuizMetrics(quizzes, studentQuizzes),
  };
}

async function fetchRows(query, label) {
  const { data, error } = await query;

  if (error) {
    throw new Error(`${label} fetch failed: ${error.message}`);
  }

  return data || [];
}

async function fetchByLessonIds(table, select, lessonIds, label) {
  if (lessonIds.length === 0) {
    return [];
  }

  return fetchRows(
    supabase.from(table).select(select).in("lid", lessonIds),
    label
  );
}

async function fetchByIds(table, select, column, ids, label, limit = null) {
  if (ids.length === 0) {
    return [];
  }

  let query = supabase.from(table).select(select).in(column, ids);

  if (limit) {
    query = query.limit(limit);
  }

  return fetchRows(query, label);
}

function buildEnrollmentMetrics(enrollments) {
  const progressValues = enrollments.map((row) =>
    clampPercent(row.progress_percent)
  );
  const completedCount = enrollments.filter((row) => row.completed).length;
  const activeSince = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const activeStudents = enrollments.filter((row) => {
    const accessedAt = row.last_accessed_at
      ? new Date(row.last_accessed_at).getTime()
      : 0;
    return accessedAt >= activeSince;
  }).length;

  return {
    enrolledStudents: enrollments.length,
    activeStudentsLast14Days: activeStudents,
    averageProgressPercent: round(average(progressValues)),
    completionRatePercent: percent(completedCount, enrollments.length),
  };
}

function buildLessonMetrics({
  lessons,
  videos,
  materials,
  quizzes,
  studentVideos,
  studentQuizzes,
}) {
  return lessons.map((lesson) => {
    const lessonVideos = videos.filter((video) => video.lid === lesson.lid);
    const lessonMaterials = materials.filter(
      (material) => material.lid === lesson.lid
    );
    const lessonQuizzes = quizzes.filter((quiz) => quiz.lid === lesson.lid);
    const lessonVideoIds = lessonVideos.map((video) => video.vid);
    const lessonQuizIds = lessonQuizzes.map((quiz) => quiz.qid);

    const lessonVideoRows = studentVideos.filter((row) =>
      lessonVideoIds.includes(row.vid)
    );
    const lessonQuizRows = studentQuizzes.filter((row) =>
      lessonQuizIds.includes(row.qid)
    );

    return {
      lid: lesson.lid,
      number: lesson.number,
      name: lesson.name,
      contentCounts: {
        videos: lessonVideos.length,
        materials: lessonMaterials.length,
        quizzes: lessonQuizzes.length,
      },
      videoCompletionPercent: percent(
        lessonVideoRows.filter((row) => row.completed).length,
        lessonVideoRows.length
      ),
      quizAverageGradePercent: round(
        average(lessonQuizRows.map((row) => Number(row.grade || 0)))
      ),
    };
  });
}

function buildVideoMetrics(videos, studentVideos, events, segments) {
  return videos.map((video) => {
    const progressRows = studentVideos.filter((row) => row.vid === video.vid);
    const videoEvents = events.filter((event) => event.vid === video.vid);
    const videoSegments = segments.filter((segment) => segment.vid === video.vid);
    const completionValues = progressRows.map((row) =>
      clampPercent(row.completion_percent)
    );
    const durationSeconds =
      maxNumber(progressRows.map((row) => Number(row.duration_seconds))) || null;
    const skipEvents = videoEvents.filter(
      (event) =>
        event.event_type === "seek_forward" &&
        Number(event.to_second) > Number(event.from_second)
    );
    const replayEvents = videoEvents.filter(
      (event) =>
        event.event_type === "replay" ||
        event.event_type === "seek_backward" ||
        Number(event.watched_delta_seconds || 0) > SKIP_BIN_SECONDS
    );

    return {
      vid: video.vid,
      lid: video.lid,
      name: video.name,
      description: video.description || "",
      durationSeconds,
      studentsStarted: progressRows.length,
      averageCompletionPercent: round(average(completionValues)),
      completionRatePercent: percent(
        progressRows.filter((row) => row.completed).length,
        progressRows.length
      ),
      averagePauseCount: round(
        average(progressRows.map((row) => Number(row.pause_count || 0)))
      ),
      averageSeekCount: round(
        average(progressRows.map((row) => Number(row.seek_count || 0)))
      ),
      averageReplayCount: round(
        average(progressRows.map((row) => Number(row.replay_count || 0)))
      ),
      skippedHotspots: buildSeekHotspots(skipEvents, durationSeconds),
      rewatchedHotspots: buildRewatchHotspots(
        replayEvents,
        videoSegments,
        durationSeconds
      ),
      dropOffHotspots: buildDropOffHotspots(progressRows, durationSeconds),
    };
  });
}

function buildMaterialMetrics(materials) {
  return materials.map((material) => ({
    maid: material.maid,
    lid: material.lid,
    name: material.name,
  }));
}

function buildQuizMetrics(quizzes, studentQuizzes) {
  return quizzes.map((quiz) => {
    const latestRows = getLatestRowsByStudent(
      studentQuizzes.filter((row) => row.qid === quiz.qid)
    );
    const grades = latestRows
      .map((row) => Number(row.grade))
      .filter((grade) => Number.isFinite(grade));

    return {
      qid: quiz.qid,
      lid: quiz.lid,
      name: quiz.name,
      passThreshold: Number(quiz.pass_threshold || 0),
      studentsAttempted: latestRows.length,
      averageGradePercent: round(average(grades)),
      passRatePercent: percent(
        latestRows.filter((row) => row.passed).length,
        latestRows.length
      ),
      failRatePercent: percent(
        latestRows.filter((row) => row.status === "completed" && !row.passed)
          .length,
        latestRows.length
      ),
    };
  });
}

function buildSeekHotspots(events, durationSeconds) {
  const bins = new Map();

  for (const event of events) {
    const fromSecond = Number(event.from_second);
    const toSecond = Number(event.to_second);

    if (!Number.isFinite(fromSecond) || !Number.isFinite(toSecond)) {
      continue;
    }

    const start = Math.max(0, Math.floor(fromSecond));
    const end = Math.max(start, Math.ceil(toSecond));

    for (
      let second = start;
      second < end;
      second += Math.max(1, SKIP_BIN_SECONDS)
    ) {
      const binStart = Math.floor(second / SKIP_BIN_SECONDS) * SKIP_BIN_SECONDS;
      const binEnd = durationSeconds
        ? Math.min(binStart + SKIP_BIN_SECONDS, durationSeconds)
        : binStart + SKIP_BIN_SECONDS;
      const key = `${binStart}-${binEnd}`;
      const bin = bins.get(key) || {
        startSecond: binStart,
        endSecond: binEnd,
        eventCount: 0,
        students: new Set(),
      };

      bin.eventCount += 1;
      bin.students.add(event.sid);
      bins.set(key, bin);
    }
  }

  return [...bins.values()]
    .sort((first, second) => second.eventCount - first.eventCount)
    .slice(0, 5)
    .map((bin) => ({
      range: formatRange(bin.startSecond, bin.endSecond),
      startSecond: bin.startSecond,
      endSecond: bin.endSecond,
      eventCount: bin.eventCount,
      uniqueStudents: bin.students.size,
    }));
}

function buildRewatchHotspots(events, segments, durationSeconds) {
  const eventBins = buildSeekHotspots(
    events.map((event) => ({
      ...event,
      from_second: event.to_second || event.position_second || 0,
      to_second: event.from_second || event.position_second || 0,
    })),
    durationSeconds
  );
  const segmentBins = segments
    .filter((segment) => Number(segment.watch_count || 0) > 1)
    .sort(
      (first, second) =>
        Number(second.watch_count || 0) - Number(first.watch_count || 0)
    )
    .slice(0, 5)
    .map((segment) => ({
      range: formatRange(segment.start_second, segment.end_second),
      startSecond: segment.start_second,
      endSecond: segment.end_second,
      watchCount: Number(segment.watch_count || 0),
      uniqueStudents: 1,
    }));

  return [...eventBins, ...segmentBins].slice(0, 5);
}

function buildDropOffHotspots(progressRows, durationSeconds) {
  if (!durationSeconds) {
    return [];
  }

  const incompleteRows = progressRows.filter((row) => !row.completed);

  return buildSeekHotspots(
    incompleteRows.map((row) => ({
      sid: row.sid,
      from_second: Number(row.last_position_seconds || 0),
      to_second:
        Number(row.last_position_seconds || 0) + Math.max(1, SKIP_BIN_SECONDS),
    })),
    durationSeconds
  );
}

function getLatestRowsByStudent(rows) {
  const latestByStudent = new Map();

  for (const row of rows) {
    const current = latestByStudent.get(row.sid);
    const currentTime = current?.completed_at
      ? new Date(current.completed_at).getTime()
      : 0;
    const rowTime = row.completed_at ? new Date(row.completed_at).getTime() : 0;

    if (!current || rowTime >= currentTime) {
      latestByStudent.set(row.sid, row);
    }
  }

  return [...latestByStudent.values()];
}

async function askGeminiForInsights(metrics) {
  const prompt = `
You are an educational analytics assistant for teachers.
Analyze this course engagement data and produce practical teaching insights.

Focus on:
- Video ranges that students skip, rewatch, or drop off from.
- Quiz performance problems and likely knowledge gaps.
- Course-level learning risks and concise teacher actions.
- Changes a teacher can make to course content, explanations, examples, pacing, quizzes, or student support.

Return JSON only with this exact shape:
{
  "title": "",
  "summary": "",
  "risk_level": "low | medium | high",
  "priority_actions": ["", ""],
  "video_insights": [
    {
      "vid": 0,
      "video_name": "",
      "finding": "",
      "evidence": "",
      "recommendation": ""
    }
  ],
  "quiz_insights": [
    {
      "qid": 0,
      "quiz_name": "",
      "finding": "",
      "evidence": "",
      "recommendation": ""
    }
  ],
  "next_experiments": ["", ""]
}

Rules:
- Do not invent IDs that are not present in the data.
- If data is weak, say what is missing and still give safe recommendations.
- Recommendations must be specific enough for a teacher to act on without developer help.
- Do not recommend UI, app navigation, platform behavior, engineering, code, or database changes.
- Do not suggest actions like "improve the UI", "ensure the transition is clear in the UI", "add reminders", or "change the player".
- If a problem seems caused by the product interface, reframe it as a teacher-owned action such as adding a short recap, clarifying the next lesson objective, recording a bridge explanation, adding examples, splitting content, or adjusting quiz questions.
- Keep each finding concise.

Course analytics data:
${JSON.stringify(metrics, null, 2)}
`;

  const { response, model } = await generateContentWithFallback(ai, {
    contents: prompt,
  });
  const insight = JSON.parse(cleanJson(response.text));

  return { insight, model };
}

async function storeInsight(course, metrics, insight, model) {
  const payload = {
    tid: course.tid,
    cid: course.cid,
    title: insight.title || `${course.name} analytics insights`,
    summary: insight.summary || "",
    risk_level: insight.risk_level || "medium",
    insight_json: insight,
    metrics_json: metrics,
    model,
    generated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(INSIGHTS_TABLE)
    .upsert(payload, { onConflict: "cid" });

  if (error) {
    throw new Error(
      `${INSIGHTS_TABLE} save failed: ${error.message}. Create the insights table first.`
    );
  }
}

async function cleanupRawVideoAnalytics(metrics) {
  if (!shouldCleanupRawAnalytics()) {
    return;
  }

  const videoIds = toArray(metrics.videos)
    .map((video) => video.vid)
    .filter(Boolean);

  if (videoIds.length === 0) {
    return;
  }

  const [eventResult, segmentResult] = await Promise.all([
    supabase.from("student_video_events").delete().in("vid", videoIds),
    supabase.from("student_video_segments").delete().in("vid", videoIds),
  ]);

  if (eventResult.error) {
    throw new Error(
      `student_video_events cleanup failed: ${eventResult.error.message}`
    );
  }

  if (segmentResult.error) {
    throw new Error(
      `student_video_segments cleanup failed: ${segmentResult.error.message}`
    );
  }

  console.log(
    `Cleaned raw video analytics for ${videoIds.length} video(s) after storing insights.`
  );
}

async function cleanupRawVideoAnalyticsForCourses(courses) {
  for (const course of courses) {
    try {
      const videoIds = await fetchCourseVideoIds(course.cid);
      await deleteRawVideoAnalytics(videoIds, `course ${course.cid}`);
    } catch (error) {
      console.error(`Raw cleanup failed for course ${course.cid}: ${error.message}`);
    }
  }
}

async function fetchCourseVideoIds(courseId) {
  const lessons = await fetchRows(
    supabase.from("lesson").select("lid").eq("cid", courseId),
    `course ${courseId} lessons`
  );
  const lessonIds = lessons.map((lesson) => lesson.lid).filter(Boolean);

  if (lessonIds.length === 0) {
    return [];
  }

  const videos = await fetchRows(
    supabase.from("video").select("vid").in("lid", lessonIds),
    `course ${courseId} videos`
  );

  return videos.map((video) => video.vid).filter(Boolean);
}

async function deleteRawVideoAnalytics(videoIds, label) {
  if (videoIds.length === 0) {
    console.log(`No videos found for ${label}.`);
    return;
  }

  const [eventCountResult, segmentCountResult] = await Promise.all([
    supabase
      .from("student_video_events")
      .select("sveid", { count: "exact", head: true })
      .in("vid", videoIds),
    supabase
      .from("student_video_segments")
      .select("svsid", { count: "exact", head: true })
      .in("vid", videoIds),
  ]);

  if (eventCountResult.error) {
    throw new Error(
      `student_video_events count failed: ${eventCountResult.error.message}`
    );
  }

  if (segmentCountResult.error) {
    throw new Error(
      `student_video_segments count failed: ${segmentCountResult.error.message}`
    );
  }

  const [eventDeleteResult, segmentDeleteResult] = await Promise.all([
    supabase.from("student_video_events").delete().in("vid", videoIds),
    supabase.from("student_video_segments").delete().in("vid", videoIds),
  ]);

  if (eventDeleteResult.error) {
    throw new Error(
      `student_video_events delete failed: ${eventDeleteResult.error.message}`
    );
  }

  if (segmentDeleteResult.error) {
    throw new Error(
      `student_video_segments delete failed: ${segmentDeleteResult.error.message}`
    );
  }

  const [remainingEventsResult, remainingSegmentsResult] = await Promise.all([
    supabase
      .from("student_video_events")
      .select("sveid", { count: "exact", head: true })
      .in("vid", videoIds),
    supabase
      .from("student_video_segments")
      .select("svsid", { count: "exact", head: true })
      .in("vid", videoIds),
  ]);

  if (remainingEventsResult.error) {
    throw new Error(
      `student_video_events verify failed: ${remainingEventsResult.error.message}`
    );
  }

  if (remainingSegmentsResult.error) {
    throw new Error(
      `student_video_segments verify failed: ${remainingSegmentsResult.error.message}`
    );
  }

  console.log(
    `Cleaned ${eventCountResult.count || 0} event row(s) and ${
      segmentCountResult.count || 0
    } segment row(s) for ${label}. Remaining: ${
      remainingEventsResult.count || 0
    } event row(s), ${remainingSegmentsResult.count || 0} segment row(s).`
  );
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(Number(value)));

  if (validValues.length === 0) {
    return 0;
  }

  return (
    validValues.reduce((total, value) => total + Number(value), 0) /
    validValues.length
  );
}

function maxNumber(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  return validValues.length > 0 ? Math.max(...validValues) : 0;
}

function percent(value, total) {
  if (!total) {
    return 0;
  }

  return round((value / total) * 100);
}

function clampPercent(value) {
  const numberValue = Number(value || 0);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numberValue));
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRange(startSecond, endSecond) {
  return `${formatTime(startSecond)}-${formatTime(endSecond)}`;
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

generateTeacherInsights().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
