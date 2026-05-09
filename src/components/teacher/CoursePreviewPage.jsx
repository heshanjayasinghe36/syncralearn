import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  ExternalLink,
  FileText,
  Flame,
  ListChecks,
  LockKeyhole,
  Video,
  XCircle,
} from "lucide-react";
import { calculateAndStoreCourseProgress } from "../../lib/courseProgress";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import TrackedYouTubePlayer from "../shared/TrackedYouTubePlayer";

const lessonContentTypes = [
  { value: "video", label: "Video" },
  { value: "material", label: "Material" },
  { value: "quiz", label: "Quize" },
];

const lessonContentConfig = {
  video: {
    table: "video",
    idColumn: "vid",
    select: "*",
    resourceColumn: "url",
  },
  material: {
    table: "material",
    idColumn: "maid",
    select: "maid, name, file, lid",
    resourceColumn: "file",
  },
  quiz: {
    table: "quize",
    idColumn: "qid",
    select: "qid, name, lid, pass_threshold",
  },
};

export default function CoursePreviewPage({
  course,
  displayName,
  onBack,
  previewLabel = "Student Preview",
  pageLabel = "Student course preview",
  backLabel = "Back to My Courses",
  enableVideoTracking = false,
  studentId = null,
}) {
  const [lessons, setLessons] = useState([]);
  const [lessonContent, setLessonContent] = useState({});
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [activeContentIndex, setActiveContentIndex] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [message, setMessage] = useState("");
  const [completedContentIds, setCompletedContentIds] = useState(new Set());
  const courseId = course?.cid || course?.id || null;
  const avatarInitials = getInitials(displayName || "Student");
  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedLessonId) || lessons[0];
  const selectedContent = selectedLesson
    ? lessonContent[selectedLesson.id] || []
    : [];
  const selectedLessonIndex = Math.max(
    lessons.findIndex((lesson) => lesson.id === selectedLesson?.id),
    0
  );
  const progressPercent =
    lessons.length > 0
      ? Math.round(((selectedLessonIndex + 1) / lessons.length) * 100)
      : 0;
  const contentItems = orderPreviewContent(selectedContent);
  const safeContentIndex = Math.min(
    activeContentIndex,
    Math.max(contentItems.length - 1, 0)
  );
  const activeContent = contentItems[safeContentIndex] || null;
  const activeDescription =
    activeContent?.description || selectedLesson?.summary || "";

  function markContentCompleted(contentId) {
    setCompletedContentIds((currentCompletedIds) => {
      const nextCompletedIds = new Set(currentCompletedIds);
      nextCompletedIds.add(contentId);
      return nextCompletedIds;
    });
  }

  function isContentCompleted(contentItem) {
    return completedContentIds.has(contentItem?.id);
  }

  function isLessonCompleted(lesson) {
    const lessonItems = lessonContent[lesson?.id] || [];
    const trackedItems = lessonItems.filter(isProgressTrackedContent);

    return (
      trackedItems.length > 0 &&
      trackedItems.every((contentItem) => isContentCompleted(contentItem))
    );
  }

  useEffect(() => {
    let ignore = false;

    async function loadLessons() {
      if (!courseId || !supabase) {
        setLessons([]);
        setLessonContent({});
        setSelectedLessonId(null);
        setMessage(
          !supabase ? supabaseConfigError || "Supabase is not configured." : ""
        );
        return;
      }

      setLoadingLessons(true);
      setMessage("");

      const { data, error } = await supabase
        .from("lesson")
        .select("lid, name, summary, number, cid")
        .eq("cid", courseId)
        .order("number", { ascending: true })
        .order("lid", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setMessage(`Lessons load failed: ${error.message}`);
        setLessons([]);
        setLessonContent({});
        setSelectedLessonId(null);
      } else {
        const mappedLessons = (data || []).map(mapPreviewLesson);
        setLessons(mappedLessons);
        setSelectedLessonId(mappedLessons[0]?.id || null);

        const { content, error: contentError } =
          await loadPreviewLessonContent(mappedLessons);

        if (ignore) {
          return;
        }

        if (contentError) {
          setMessage(`Lesson content load failed: ${contentError.message}`);
          setLessonContent({});
        } else {
          setLessonContent(content);
        }
      }

      setLoadingLessons(false);
    }

    loadLessons();

    return () => {
      ignore = true;
    };
  }, [courseId]);

  useEffect(() => {
    let ignore = false;

    async function loadCompletedContent() {
      if (!enableVideoTracking || !studentId || !courseId || !supabase) {
        setCompletedContentIds(new Set());
        return;
      }

      const allContent = Object.values(lessonContent).flat();

      if (allContent.length === 0) {
        setCompletedContentIds(new Set());
        return;
      }

      const videoIds = getContentDatabaseIds(allContent, "video");
      const quizIds = getContentDatabaseIds(allContent, "quiz");

      const [videoResult, quizResult] = await Promise.all([
        fetchCompletedVideos(studentId, videoIds),
        fetchCompletedQuizzes(studentId, quizIds),
      ]);

      if (ignore) {
        return;
      }

      const completedIds = new Set();

      addCompletedIds(completedIds, allContent, "video", videoResult);
      addCompletedIds(completedIds, allContent, "quiz", quizResult);

      setCompletedContentIds(completedIds);
    }

    void loadCompletedContent();

    return () => {
      ignore = true;
    };
  }, [courseId, enableVideoTracking, lessonContent, studentId]);

  return (
    <main
      className={`course-preview-page ${
        sidebarCollapsed ? "is-sidebar-collapsed" : ""
      }`}
      aria-label={pageLabel}
    >
      <header className="course-preview-topbar">
        <div className="course-preview-brand-group">
          <p className="course-preview-brand">Syncra Learn</p>
          {previewLabel ? <span>{previewLabel}</span> : null}
        </div>

        <div className="course-preview-top-actions">
          <button
            type="button"
            className="teacher-icon-button"
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
          </button>

          <div className="student-streak-chip" aria-label="Learning streak">
            <Flame aria-hidden="true" />
            <span>0</span>
          </div>

          <div className="teacher-profile-chip">
            <div className="teacher-avatar" aria-label="Student avatar">
              {avatarInitials}
            </div>
          </div>
        </div>
      </header>

      <aside className="course-preview-sidebar">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="course-preview-collapse"
            onClick={() => setSidebarCollapsed((currentValue) => !currentValue)}
            aria-label="Expand sidebar"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}

        {sidebarCollapsed ? (
          <div
            className="course-preview-mini-rail"
            aria-label="Collapsed lesson navigation"
          >
            <div
              className="course-preview-mini-book"
              style={{ "--course-progress": `${progressPercent}%` }}
              aria-label={course?.title || course?.name || "Course"}
            >
              <BookOpen aria-hidden="true" />
            </div>

            <nav
              className="course-preview-mini-lessons"
              aria-label="Lesson numbers"
            >
              {loadingLessons ? (
                <span className="course-preview-mini-empty">...</span>
              ) : lessons.length > 0 ? (
                lessons.map((lesson, index) => (
                  <button
                    key={lesson.id}
                    type="button"
                    className={`course-preview-mini-lesson ${
                      selectedLesson?.id === lesson.id ? "is-active" : ""
                    } ${isLessonCompleted(lesson) ? "is-complete" : ""}`}
                    aria-label={`Open lesson ${index + 1}: ${lesson.name}`}
                    aria-current={
                      selectedLesson?.id === lesson.id ? "step" : undefined
                    }
                    title={lesson.name}
                    onClick={() => {
                      setSelectedLessonId(lesson.id);
                      setActiveContentIndex(0);
                    }}
                  >
                    {index + 1}
                  </button>
                ))
              ) : (
                <span className="course-preview-mini-empty">0</span>
              )}
            </nav>
          </div>
        ) : null}

        <div className="course-preview-sidebar-head">
          {!sidebarCollapsed ? (
            <button
              type="button"
              className="course-preview-collapse"
              onClick={() =>
                setSidebarCollapsed((currentValue) => !currentValue)
              }
              aria-label="Collapse sidebar"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}

          <div className="course-preview-title-card">
            <span>
              <BookOpen aria-hidden="true" />
            </span>
            <div>
              <h2>{course?.title || course?.name || "Untitled Course"}</h2>
            </div>
          </div>
        </div>

        <div className="course-preview-progress" aria-label="Lesson progress">
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <nav className="course-preview-lessons" aria-label="Course lessons">
          {loadingLessons ? (
            <span className="course-preview-empty">Loading lessons...</span>
          ) : lessons.length > 0 ? (
            lessons.map((lesson, index) => (
              <LessonNavButton
                key={lesson.id}
                lesson={lesson}
                active={selectedLesson?.id === lesson.id}
                completed={isLessonCompleted(lesson)}
                current={index === selectedLessonIndex}
                onClick={() => {
                  setSelectedLessonId(lesson.id);
                  setActiveContentIndex(0);
                }}
              />
            ))
          ) : (
            <span className="course-preview-empty">
              No lessons created yet.
            </span>
          )}
        </nav>

        <button
          type="button"
          className="course-preview-back"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          <span>{backLabel}</span>
        </button>
      </aside>

      <section className="course-preview-stage">
        {message ? <p className="course-preview-message">{message}</p> : null}

        <section className="course-preview-lesson-card">
          <div className="course-preview-lesson-header">
            <h3>{selectedLesson?.name || "Select a lesson"}</h3>
            <span>{formatLessonBadge(activeContent)}</span>
          </div>

          {activeContent?.type === "video" && activeContent.resource ? (
            <PreviewVideo
              url={activeContent.resource}
              title={activeContent.title}
              videoDatabaseId={activeContent.databaseId}
              courseId={courseId}
              studentId={studentId}
              enableTracking={enableVideoTracking}
              onComplete={() => markContentCompleted(activeContent.id)}
            />
          ) : activeContent?.type === "material" && activeContent.resource ? (
            <PreviewPdf
              url={activeContent.resource}
              title={activeContent.title}
            />
          ) : activeContent?.type === "quiz" ? (
            <PreviewQuiz
              item={activeContent}
              completed={isContentCompleted(activeContent)}
              courseId={courseId}
              studentId={studentId}
              enableTracking={enableVideoTracking}
              onComplete={() => markContentCompleted(activeContent.id)}
            />
          ) : activeContent?.resource ? (
            <a
              className="course-preview-main-resource"
              href={activeContent.resource}
              target="_blank"
              rel="noreferrer"
            >
              <PreviewContentIcon type={activeContent.type} />
              <span>Open {activeContent.label}</span>
              <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            <div className="course-preview-placeholder">
              <BookOpen aria-hidden="true" />
              <span>No primary content attached yet.</span>
            </div>
          )}

          {activeDescription ? <p>{activeDescription}</p> : null}
        </section>

        {contentItems.length > 1 ? (
          <ContentSwitcher
            items={contentItems}
            activeIndex={safeContentIndex}
            onChange={setActiveContentIndex}
          />
        ) : null}
      </section>
    </main>
  );
}

function LessonNavButton({ lesson, active, completed, current, onClick }) {
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      onClick={onClick}
    >
      <i>
        {completed ? (
          <CheckCircle2 aria-hidden="true" />
        ) : current ? (
          <CirclePlay aria-hidden="true" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
      </i>
      <span>{lesson.name}</span>
    </button>
  );
}

function getContentDatabaseIds(contentItems, type) {
  return contentItems
    .filter((contentItem) => contentItem.type === type)
    .map((contentItem) => contentItem.databaseId)
    .filter(Boolean);
}

function isProgressTrackedContent(contentItem) {
  return contentItem?.type === "video" || contentItem?.type === "quiz";
}

async function fetchCompletedVideos(studentId, videoIds) {
  if (videoIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("student_video")
    .select("vid, completed, completion_percent")
    .eq("sid", studentId)
    .in("vid", videoIds);

  if (error) {
    console.warn("Completed videos load failed:", error.message);
    return [];
  }

  return (data || [])
    .filter(
      (row) => row.completed || Number(row.completion_percent || 0) >= 90
    )
    .map((row) => row.vid);
}

async function fetchCompletedQuizzes(studentId, quizIds) {
  if (quizIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("student_quize")
    .select("qid, grade")
    .eq("sid", studentId)
    .in("qid", quizIds);

  if (error) {
    console.warn("Completed quizzes load failed:", error.message);
    return [];
  }

  return (data || [])
    .filter((row) => Number.isFinite(Number(row.grade)))
    .map((row) => row.qid);
}

function addCompletedIds(completedIds, contentItems, type, completedDatabaseIds) {
  const completedDatabaseIdSet = new Set(
    completedDatabaseIds.map((id) => String(id))
  );

  contentItems
    .filter((contentItem) => contentItem.type === type)
    .filter((contentItem) =>
      completedDatabaseIdSet.has(String(contentItem.databaseId))
    )
    .forEach((contentItem) => completedIds.add(contentItem.id));
}

function mapPreviewLesson(row) {
  return {
    id: row?.lid || row?.id || row?.name,
    databaseId: row?.lid || row?.id || null,
    name: row?.name || "Untitled Lesson",
    number: Number(row?.number) || 0,
    summary: row?.summary || "",
  };
}

function orderPreviewContent(content) {
  const contentOrder = {
    video: 0,
    material: 1,
    quiz: 2,
  };

  return [...content].sort((firstItem, secondItem) => {
    const firstOrder = contentOrder[firstItem.type] ?? 99;
    const secondOrder = contentOrder[secondItem.type] ?? 99;

    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return String(firstItem.title).localeCompare(String(secondItem.title));
  });
}

function ContentSwitcher({ items, activeIndex, onChange }) {
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < items.length - 1;

  return (
    <div className="course-preview-content-switcher" aria-label="Lesson content">
      <button
        type="button"
        onClick={() => onChange(activeIndex - 1)}
        disabled={!canGoBack}
        aria-label="Previous lesson content"
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <div
        className="course-preview-content-lines"
        role="tablist"
        style={{ "--line-count": items.length }}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => onChange(index)}
            aria-label={`Show ${item.label}`}
            aria-selected={index === activeIndex}
            role="tab"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange(activeIndex + 1)}
        disabled={!canGoForward}
        aria-label="Next lesson content"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

function PreviewContentIcon({ type }) {
  if (type === "video") {
    return <Video aria-hidden="true" />;
  }

  if (type === "material") {
    return <FileText aria-hidden="true" />;
  }

  return <ListChecks aria-hidden="true" />;
}

function PreviewPdf({ url, title }) {
  return (
    <div className="course-preview-pdf">
      <iframe src={url} title={`${title} material preview`} />
      <a href={url} target="_blank" rel="noreferrer">
        <ExternalLink aria-hidden="true" />
        <span>Open PDF</span>
      </a>
    </div>
  );
}

function PreviewVideo({
  url,
  title,
  videoDatabaseId,
  courseId,
  studentId,
  enableTracking,
  onComplete,
}) {
  const preview = getVideoPreview(url);

  if (!preview) {
    return (
      <a
        className="course-preview-resource-link"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink aria-hidden="true" />
        <span>Open video</span>
      </a>
    );
  }

  if (preview.type === "iframe") {
    if (enableTracking && studentId && videoDatabaseId && preview.videoId) {
      return (
        <TrackedYouTubePlayer
          videoId={preview.videoId}
          videoDatabaseId={videoDatabaseId}
          courseId={courseId}
          studentId={studentId}
          title={title}
          onComplete={onComplete}
        />
      );
    }

    return (
      <div className="course-preview-video">
        <iframe
          src={preview.src}
          title={`${title} preview`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="course-preview-video">
      <video controls src={preview.src}>
        <track kind="captions" />
      </video>
    </div>
  );
}

async function loadPreviewLessonContent(lessons) {
  const lessonIds = lessons
    .map((lesson) => lesson.databaseId)
    .filter(Boolean);

  if (lessonIds.length === 0) {
    return { content: {}, error: null };
  }

  const [videoResult, materialResult, quizResult] = await Promise.all([
    supabase
      .from(lessonContentConfig.video.table)
      .select(lessonContentConfig.video.select)
      .in("lid", lessonIds),
    supabase
      .from(lessonContentConfig.material.table)
      .select(lessonContentConfig.material.select)
      .in("lid", lessonIds),
    supabase
      .from(lessonContentConfig.quiz.table)
      .select(lessonContentConfig.quiz.select)
      .in("lid", lessonIds),
  ]);

  const failedResult = [videoResult, materialResult, quizResult].find(
    (result) => result.error
  );

  if (failedResult?.error) {
    return { content: {}, error: failedResult.error };
  }

  const lessonIdByDatabaseId = lessons.reduce((index, lesson) => {
    index[String(lesson.databaseId)] = lesson.id;
    return index;
  }, {});
  const content = {};

  lessons.forEach((lesson) => {
    content[lesson.id] = [];
  });

  [
    ["video", videoResult.data || []],
    ["material", materialResult.data || []],
    ["quiz", quizResult.data || []],
  ].forEach(([type, rows]) => {
    const contentType = lessonContentTypes.find((item) => item.value === type);

    rows.forEach((row) => {
      const lessonId = lessonIdByDatabaseId[String(row.lid)];

      if (!lessonId) {
        return;
      }

      content[lessonId].push(
        mapPreviewLessonContentRow(row, type, contentType?.label)
      );
    });
  });

  return { content, error: null };
}

function mapPreviewLessonContentRow(row, type, fallbackLabel = "Content") {
  const config = lessonContentConfig[type];
  const idValue = row?.[config.idColumn];
  const resourceValue = config.resourceColumn
    ? row?.[config.resourceColumn] || ""
    : "";

  return {
    id: `${type}-${idValue || row?.name}`,
    databaseId: idValue || null,
    type,
    label: fallbackLabel,
    title: row?.name || "Untitled",
    resource: resourceValue,
    description: row?.description || "",
    passThreshold: row?.pass_threshold ?? null,
    duration:
      row?.duration ||
      row?.length ||
      row?.video_length ||
      row?.duration_minutes ||
      null,
  };
}

function PreviewQuiz({ item, completed, courseId, studentId, enableTracking, onComplete }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [reviewAnswers, setReviewAnswers] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [takingQuiz, setTakingQuiz] = useState(false);
  const [quizMessage, setQuizMessage] = useState("");
  const [quizResult, setQuizResult] = useState(null);
  const canTakeQuiz = Boolean(enableTracking && studentId && item?.databaseId);
  const allQuestionsAnswered =
    questions.length > 0 &&
    questions.every((question) => Boolean(answers[question.id]));

  async function loadQuizQuestions() {
    const { data, error } = await supabase
      .from("quize_questions")
      .select("qqid, question, type, quize_options(oid, option_text, is_correct)")
      .eq("qid", item.databaseId)
      .order("qqid", { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []).map(mapStudentQuizQuestion);
  }

  async function startQuiz() {
    if (!canTakeQuiz) {
      setQuizMessage("Quiz attempts are available only for enrolled students.");
      return;
    }

    setLoadingQuiz(true);
    setQuizMessage("");
    setQuizResult(null);
    setReviewAnswers(null);

    let mappedQuestions = [];

    try {
      mappedQuestions = await loadQuizQuestions();
    } catch (error) {
      setQuizMessage(`Quiz load failed: ${error.message}`);
      setLoadingQuiz(false);
      return;
    }

    if (mappedQuestions.length === 0) {
      setQuizMessage("This quiz has no questions yet.");
      setLoadingQuiz(false);
      return;
    }

    setQuestions(mappedQuestions);
    setAnswers({});
    setStartedAt(Date.now());
    setTakingQuiz(true);
    setLoadingQuiz(false);
  }

  function updateAnswer(questionId, optionId) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: optionId,
    }));
  }

  async function checkAnswers() {
    if (!canTakeQuiz || loadingReview) {
      return;
    }

    setLoadingReview(true);
    setQuizMessage("");

    try {
      const loadedQuestions =
        questions.length > 0 ? questions : await loadQuizQuestions();
      const { data: attempt, error: attemptError } = await supabase
        .from("student_quize")
        .select("sqid, grade")
        .eq("sid", studentId)
        .eq("qid", item.databaseId)
        .order("sqid", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attemptError) {
        throw attemptError;
      }

      if (!attempt?.sqid) {
        setQuizMessage("Submit the quiz once before checking answers.");
        return;
      }

      const { data: savedAnswers, error: savedAnswersError } = await supabase
        .from("student_quize_answers")
        .select("qqid, oid, is_correct")
        .eq("sqid", attempt.sqid);

      if (savedAnswersError) {
        throw savedAnswersError;
      }

      const savedAnswerByQuestionId = (savedAnswers || []).reduce(
        (index, savedAnswer) => {
          index[String(savedAnswer.qqid)] = savedAnswer;
          return index;
        },
        {}
      );

      setQuestions(loadedQuestions);
      setReviewAnswers(
        loadedQuestions.map((question) => {
          const selectedAnswer =
            savedAnswerByQuestionId[String(question.databaseId)];
          const selectedOption = question.options.find(
            (option) => option.databaseId === selectedAnswer?.oid
          );
          const correctOptions = question.options.filter(
            (option) => option.isCorrect
          );

          return {
            questionId: question.id,
            question: question.question,
            selectedText: selectedOption?.text || "No answer selected",
            correctText:
              correctOptions.map((option) => option.text).join(", ") ||
              "No correct answer set",
            isCorrect: Boolean(selectedAnswer?.is_correct),
          };
        })
      );
    } catch (error) {
      setQuizMessage(`Answer review failed: ${error.message}`);
    } finally {
      setLoadingReview(false);
    }
  }

  async function submitQuiz() {
    if (!canTakeQuiz || submittingQuiz) {
      return;
    }

    if (!allQuestionsAnswered) {
      setQuizMessage("Answer every question before submitting.");
      return;
    }

    setSubmittingQuiz(true);
    setQuizMessage("");

    const correctCount = questions.filter((question) => {
      const selectedOptionId = answers[question.id];
      const selectedOption = question.options.find(
        (option) => option.id === selectedOptionId
      );

      return Boolean(selectedOption?.isCorrect);
    }).length;
    const grade = Math.round((correctCount / questions.length) * 100);
    const elapsedSeconds = Math.max(
      1,
      Math.round((Date.now() - (startedAt || Date.now())) / 1000)
    );

    const passThreshold = Number(item?.passThreshold || 0);
    const passed = passThreshold > 0 ? grade >= passThreshold : true;
    const { data: existingAttempt, error: existingAttemptError } =
      await supabase
        .from("student_quize")
        .select("sqid")
        .eq("sid", studentId)
        .eq("qid", item.databaseId)
        .order("sqid", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingAttemptError) {
      setQuizMessage(`Quiz attempt load failed: ${existingAttemptError.message}`);
      setSubmittingQuiz(false);
      return;
    }

    const attemptPayload = {
      sid: studentId,
      qid: item.databaseId,
      time: formatPostgresInterval(elapsedSeconds),
      grade,
      status: "completed",
      completed_at: new Date().toISOString(),
      passed,
    };
    const attemptQuery = existingAttempt?.sqid
      ? supabase
          .from("student_quize")
          .update(attemptPayload)
          .eq("sqid", existingAttempt.sqid)
          .select("sqid")
          .single()
      : supabase
          .from("student_quize")
          .insert(attemptPayload)
          .select("sqid")
          .single();
    const { data: attempt, error: attemptError } = await attemptQuery;

    if (attemptError) {
      setQuizMessage(`Quiz submit failed: ${attemptError.message}`);
      setSubmittingQuiz(false);
      return;
    }

    if (existingAttempt?.sqid) {
      const { error: deleteAnswerError } = await supabase
        .from("student_quize_answers")
        .delete()
        .eq("sqid", existingAttempt.sqid);

      if (deleteAnswerError) {
        setQuizMessage(`Previous answers clear failed: ${deleteAnswerError.message}`);
        setSubmittingQuiz(false);
        return;
      }
    }

    const answerRows = questions.map((question) => {
      const selectedOptionId = answers[question.id];
      const selectedOption = question.options.find(
        (option) => option.id === selectedOptionId
      );

      return {
        sqid: attempt.sqid,
        qqid: question.databaseId,
        oid: selectedOption?.databaseId || null,
        is_correct: Boolean(selectedOption?.isCorrect),
      };
    });

    const { error: answerError } = await supabase
      .from("student_quize_answers")
      .insert(answerRows);

    if (answerError) {
      setQuizMessage(`Quiz answer save failed: ${answerError.message}`);
      setSubmittingQuiz(false);
      return;
    }

    try {
      await calculateAndStoreCourseProgress({ studentId, courseId });
    } catch (error) {
      console.warn("Quiz course progress update failed:", error.message);
    }

    setQuizResult({
      grade,
      correctCount,
      totalQuestions: questions.length,
      passed,
    });
    void checkAnswers();
    setTakingQuiz(false);
    setSubmittingQuiz(false);
    onComplete?.();
  }

  return (
    <div className="course-preview-quiz">
      <ListChecks aria-hidden="true" />
      <div>
        <span>Quiz</span>
        <h4>{item?.title || "Lesson quiz"}</h4>
        {item?.passThreshold ? (
          <p>Pass threshold: {item.passThreshold}%</p>
        ) : null}
        {quizResult ? (
          <div className="course-quiz-result" role="status">
            <strong>{quizResult.grade}%</strong>
            <p>
              {quizResult.correctCount} of {quizResult.totalQuestions} correct.
              {quizResult.passed ? " Quiz completed." : " Try again to pass."}
            </p>
          </div>
        ) : null}
        {!takingQuiz ? (
          <div className="course-quiz-actions">
            <button
              type="button"
              onClick={startQuiz}
              disabled={loadingQuiz || !canTakeQuiz}
            >
              {loadingQuiz ? "Loading..." : completed ? "Retake" : "Start"}
            </button>
            {completed || quizResult ? (
              <button
                type="button"
                className="course-quiz-secondary"
                onClick={checkAnswers}
                disabled={loadingReview || !canTakeQuiz}
              >
                {loadingReview ? "Checking..." : "Check answers"}
              </button>
            ) : null}
          </div>
        ) : null}
        {takingQuiz ? (
          <div className="course-quiz-taking">
            {questions.map((question, questionIndex) => (
              <section key={question.id} className="course-quiz-question">
                <p>
                  Question {questionIndex + 1}: {question.question}
                </p>
                <div>
                  {question.options.map((option) => (
                    <label key={option.id} className="course-quiz-option">
                      <input
                        type="radio"
                        name={`student-quiz-${item.databaseId}-${question.id}`}
                        checked={answers[question.id] === option.id}
                        onChange={() => updateAnswer(question.id, option.id)}
                        disabled={submittingQuiz}
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <button
              type="button"
              onClick={submitQuiz}
              disabled={submittingQuiz || !allQuestionsAnswered}
            >
              {submittingQuiz ? "Submitting..." : "Submit Quiz"}
            </button>
          </div>
        ) : null}
        {reviewAnswers ? (
          <div className="course-quiz-review">
            {reviewAnswers.map((answer, index) => (
              <section
                key={answer.questionId}
                className={answer.isCorrect ? "is-correct" : "is-wrong"}
              >
                <div className="course-quiz-review-heading">
                  <p>Question {index + 1}: {answer.question}</p>
                  <small>
                    {answer.isCorrect ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : (
                      <XCircle aria-hidden="true" />
                    )}
                    {answer.isCorrect ? "Correct" : "Wrong"}
                  </small>
                </div>
                <span>Chosen answer: {answer.selectedText}</span>
                <strong>Correct answer: {answer.correctText}</strong>
              </section>
            ))}
          </div>
        ) : null}
        {quizMessage ? <p role="alert">{quizMessage}</p> : null}
      </div>
    </div>
  );
}

function mapStudentQuizQuestion(row) {
  return {
    id: `question-${row.qqid}`,
    databaseId: row.qqid,
    question: row.question || "Untitled question",
    type: row.type || "single_choice",
    options: (row.quize_options || [])
      .slice()
      .sort((firstOption, secondOption) => {
        const firstId = Number(firstOption?.oid) || 0;
        const secondId = Number(secondOption?.oid) || 0;
        return firstId - secondId;
      })
      .map((option) => ({
        id: `option-${option.oid}`,
        databaseId: option.oid,
        text: option.option_text || "Untitled option",
        isCorrect: Boolean(option.is_correct),
      })),
  };
}

function formatPostgresInterval(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatLessonBadge(item) {
  if (!item) {
    return "Lesson";
  }

  if (item.type !== "video") {
    return item.label || "Lesson";
  }

  return "Video";
}

function getVideoPreview(url) {
  const cleanUrl = url?.trim();

  if (!cleanUrl) {
    return null;
  }

  const youtubeVideoId = getYouTubeVideoId(cleanUrl);

  if (youtubeVideoId) {
    return {
      type: "iframe",
      src: `https://www.youtube.com/embed/${youtubeVideoId}`,
      videoId: youtubeVideoId,
    };
  }

  if (isDirectVideoUrl(cleanUrl)) {
    return { type: "video", src: cleanUrl };
  }

  return null;
}

function getYouTubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return parsedUrl.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    ) {
      const videoId = parsedUrl.searchParams.get("v");

      if (videoId) {
        return videoId;
      }

      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      const embedIndex = pathParts.findIndex((part) => part === "embed");
      const shortsIndex = pathParts.findIndex((part) => part === "shorts");

      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1];
      }

      if (shortsIndex >= 0 && pathParts[shortsIndex + 1]) {
        return pathParts[shortsIndex + 1];
      }
    }

    return null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
