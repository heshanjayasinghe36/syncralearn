import { supabase } from "./supabase";

const VIDEO_COMPLETE_PERCENT = 90;

export async function calculateAndStoreCourseProgress({ studentId, courseId }) {
  if (!supabase || !studentId || !courseId) {
    return null;
  }

  const { data: lessons, error: lessonError } = await supabase
    .from("lesson")
    .select("lid")
    .eq("cid", courseId);

  if (lessonError) {
    throw lessonError;
  }

  const lessonIds = (lessons || []).map((lesson) => lesson.lid).filter(Boolean);

  if (lessonIds.length === 0) {
    return updateStoredCourseProgress({
      studentId,
      courseId,
      progressPercent: 0,
      completed: false,
    });
  }

  const [videoResult, quizResult] = await Promise.all([
    supabase.from("video").select("vid").in("lid", lessonIds),
    supabase.from("quize").select("qid, pass_threshold").in("lid", lessonIds),
  ]);

  const failedContentResult = [videoResult, quizResult].find(
    (result) => result.error
  );

  if (failedContentResult?.error) {
    throw failedContentResult.error;
  }

  const videos = videoResult.data || [];
  const quizzes = quizResult.data || [];
  const totalItems = videos.length + quizzes.length;

  if (totalItems === 0) {
    return updateStoredCourseProgress({
      studentId,
      courseId,
      progressPercent: 0,
      completed: false,
    });
  }

  const [studentVideoResult, studentQuizResult] = await Promise.all([
    fetchStudentVideoProgress(studentId, videos),
    fetchStudentQuizProgress(studentId, quizzes),
  ]);

  const completedItems =
    studentVideoResult.completedCount + studentQuizResult.completedCount;
  const progressPercent = Math.round((completedItems / totalItems) * 100);
  const completed = progressPercent >= 100;

  return updateStoredCourseProgress({
    studentId,
    courseId,
    progressPercent,
    completed,
  });
}

async function fetchStudentVideoProgress(studentId, videos) {
  const videoIds = videos.map((video) => video.vid).filter(Boolean);

  if (videoIds.length === 0) {
    return { completedCount: 0 };
  }

  const { data, error } = await supabase
    .from("student_video")
    .select("vid, completed, completion_percent")
    .eq("sid", studentId)
    .in("vid", videoIds);

  if (error) {
    throw error;
  }

  return {
    completedCount: (data || []).filter(
      (row) =>
        row.completed ||
        Number(row.completion_percent || 0) >= VIDEO_COMPLETE_PERCENT
    ).length,
  };
}

async function fetchStudentQuizProgress(studentId, quizzes) {
  const quizIds = quizzes.map((quiz) => quiz.qid).filter(Boolean);

  if (quizIds.length === 0) {
    return { completedCount: 0 };
  }

  const { data, error } = await supabase
    .from("student_quize")
    .select("qid, grade")
    .eq("sid", studentId)
    .in("qid", quizIds);

  if (error) {
    throw error;
  }

  const passThresholdByQuizId = quizzes.reduce((index, quiz) => {
    index[String(quiz.qid)] = Number(quiz.pass_threshold || 0);
    return index;
  }, {});

  const completedQuizIds = new Set();

  (data || []).forEach((row) => {
    const grade = Number(row.grade);

    if (!Number.isFinite(grade)) {
      return;
    }

    if (Object.hasOwn(passThresholdByQuizId, String(row.qid))) {
      completedQuizIds.add(String(row.qid));
    }
  });

  return {
    completedCount: completedQuizIds.size,
  };
}

async function updateStoredCourseProgress({
  studentId,
  courseId,
  progressPercent,
  completed,
}) {
  const now = new Date().toISOString();
  const payload = {
    sid: studentId,
    cid: courseId,
    progress_percent: progressPercent,
    completed,
    last_accessed_at: now,
  };

  if (completed) {
    payload.completed_at = now;
  }

  const { error } = await supabase
    .from("student_course")
    .upsert(payload, { onConflict: "sid,cid" });

  if (error) {
    throw error;
  }

  return {
    progressPercent,
    completed,
  };
}
