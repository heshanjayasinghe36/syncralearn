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
} from "lucide-react";
import { supabase, supabaseConfigError } from "../lib/supabase";

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
    select: "qid, name, url, lid",
    resourceColumn: "url",
  },
};

export default function CoursePreviewPage({ course, displayName, onBack }) {
  const [lessons, setLessons] = useState([]);
  const [lessonContent, setLessonContent] = useState({});
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [message, setMessage] = useState("");
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
  const primaryContent =
    selectedContent.find((item) => item.type === "video") || selectedContent[0];
  const additionalContent = primaryContent
    ? selectedContent.filter((item) => item.id !== primaryContent.id)
    : selectedContent;

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

  return (
    <main
      className={`course-preview-page ${
        sidebarCollapsed ? "is-sidebar-collapsed" : ""
      }`}
      aria-label="Student course preview"
    >
      <header className="course-preview-topbar">
        <p className="course-preview-brand">Syncra Learn</p>

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
                    } ${index < selectedLessonIndex ? "is-complete" : ""}`}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    aria-label={`Open lesson ${index + 1}: ${lesson.name}`}
                    aria-current={
                      selectedLesson?.id === lesson.id ? "step" : undefined
                    }
                    title={lesson.name}
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
              <button
                key={lesson.id}
                type="button"
                className={selectedLesson?.id === lesson.id ? "is-active" : ""}
                onClick={() => setSelectedLessonId(lesson.id)}
              >
                <i>
                  {index < selectedLessonIndex ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : index === selectedLessonIndex ? (
                    <CirclePlay aria-hidden="true" />
                  ) : (
                    <LockKeyhole aria-hidden="true" />
                  )}
                </i>
                <span>{lesson.name}</span>
              </button>
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
          <span>Back to My Courses</span>
        </button>
      </aside>

      <section className="course-preview-stage">
        {message ? <p className="course-preview-message">{message}</p> : null}

        <section className="course-preview-lesson-card">
          <div className="course-preview-lesson-header">
            <h3>{selectedLesson?.name || "Select a lesson"}</h3>
            <span>{formatLessonBadge(primaryContent)}</span>
          </div>

          {primaryContent?.type === "video" && primaryContent.resource ? (
            <PreviewVideo
              url={primaryContent.resource}
              title={primaryContent.title}
            />
          ) : primaryContent?.resource ? (
            <a
              className="course-preview-main-resource"
              href={primaryContent.resource}
              target="_blank"
              rel="noreferrer"
            >
              <PreviewContentIcon type={primaryContent.type} />
              <span>Open {primaryContent.label}</span>
              <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            <div className="course-preview-placeholder">
              <BookOpen aria-hidden="true" />
              <span>No primary content attached yet.</span>
            </div>
          )}

          <p>
            {primaryContent?.description ||
              selectedLesson?.summary ||
              "This lesson is ready for preview. Add a video description, material, or quiz to make this section richer for students."}
          </p>
        </section>

        {loadingLessons || additionalContent.length > 0 ? (
          <section
            className="course-preview-content-list"
            aria-label="Additional lesson content"
          >
            {loadingLessons ? (
              <p className="course-preview-empty">Loading lesson content...</p>
            ) : (
              additionalContent.map((item) => (
                <article key={item.id} className="course-preview-content-card">
                  <div className="course-preview-content-heading">
                    <span>
                      <PreviewContentIcon type={item.type} />
                    </span>
                    <div>
                      <p>{item.label}</p>
                      <h4>{item.title}</h4>
                      {item.description ? (
                        <small>{item.description}</small>
                      ) : null}
                    </div>
                  </div>

                  {item.type === "video" && item.resource ? (
                    <PreviewVideo url={item.resource} title={item.title} />
                  ) : item.resource ? (
                    <a
                      className="course-preview-resource-link"
                      href={item.resource}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink aria-hidden="true" />
                      <span>
                        Open {item.type === "quiz" ? "quiz" : "material"}
                      </span>
                    </a>
                  ) : (
                    <p className="course-preview-resource-empty">
                      No resource attached yet.
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
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

function PreviewContentIcon({ type }) {
  if (type === "video") {
    return <Video aria-hidden="true" />;
  }

  if (type === "material") {
    return <FileText aria-hidden="true" />;
  }

  return <ListChecks aria-hidden="true" />;
}

function PreviewVideo({ url, title }) {
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
  const resourceValue = row?.[config.resourceColumn] || "";

  return {
    id: `${type}-${idValue || row?.name}`,
    databaseId: idValue || null,
    type,
    label: fallbackLabel,
    title: row?.name || "Untitled",
    resource: resourceValue,
    description: row?.description || "",
    duration:
      row?.duration ||
      row?.length ||
      row?.video_length ||
      row?.duration_minutes ||
      null,
  };
}

function formatLessonBadge(item) {
  if (!item) {
    return "Lesson";
  }

  if (item.type !== "video") {
    return item.label || "Lesson";
  }

  return `Video - ${formatVideoDuration(item)}`;
}

function formatVideoDuration(item) {
  if (!item?.duration) {
    return "Preview";
  }

  const numericDuration = Number(item.duration);

  if (Number.isFinite(numericDuration)) {
    return `${numericDuration} min${numericDuration === 1 ? "" : "s"}`;
  }

  return String(item.duration);
}

function getVideoPreview(url) {
  const cleanUrl = url?.trim();

  if (!cleanUrl) {
    return null;
  }

  const youtubeUrl = getYouTubeEmbedUrl(cleanUrl);

  if (youtubeUrl) {
    return { type: "iframe", src: youtubeUrl };
  }

  if (isDirectVideoUrl(cleanUrl)) {
    return { type: "video", src: cleanUrl };
  }

  return null;
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const videoId = parsedUrl.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    ) {
      const videoId = parsedUrl.searchParams.get("v");

      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }

      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      const embedIndex = pathParts.findIndex((part) => part === "embed");
      const shortsIndex = pathParts.findIndex((part) => part === "shorts");

      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${pathParts[embedIndex + 1]}`;
      }

      if (shortsIndex >= 0 && pathParts[shortsIndex + 1]) {
        return `https://www.youtube.com/embed/${pathParts[shortsIndex + 1]}`;
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
