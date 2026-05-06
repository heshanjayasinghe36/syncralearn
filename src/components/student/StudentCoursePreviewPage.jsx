import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Clock3,
  FileText,
  Play,
  Milestone,
  Sparkles,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";

export default function StudentCoursePreviewPage({ course, onBack }) {
  const [lessons, setLessons] = useState([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [message, setMessage] = useState("");
  const courseId = course?.cid || course?.id || null;
  const previewVideo = getVideoPreview(course?.introVideoUrl || course?.intro_vid_url);
  const amountLabel = formatCourseAmount(course?.amount);
  const isFree = amountLabel === "Free";

  useEffect(() => {
    let ignore = false;

    async function loadCourseLessons() {
      if (!courseId || !supabase) {
        setLessons([]);
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
        setLessons([]);
        setMessage(`Curriculum load failed: ${error.message}`);
      } else {
        setLessons((data || []).map(mapPreviewLesson));
      }

      setLoadingLessons(false);
    }

    void loadCourseLessons();

    return () => {
      ignore = true;
    };
  }, [courseId]);

  return (
    <section className="student-course-preview-page" aria-label="Course preview">
      <button type="button" className="student-preview-back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back to courses
      </button>

      <div className="student-preview-main">
        <div className="student-preview-content-column">
          <section className="student-preview-video-card">
            {previewVideo ? (
              previewVideo.type === "iframe" ? (
                <iframe
                  src={previewVideo.src}
                  title={`${course?.name || "Course"} introduction video`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video controls src={previewVideo.src}>
                  <track kind="captions" />
                </video>
              )
            ) : course?.imgUrl ? (
              <img src={course.imgUrl} alt="" />
            ) : (
              <div className="student-preview-video-empty">
                <BookOpen aria-hidden="true" />
                <span>Introduction preview coming soon</span>
              </div>
            )}

            {previewVideo ? (
              <span className="student-preview-video-badge">
                <i />
                Preview only
              </span>
            ) : null}
          </section>

          <section className="student-preview-curriculum">
            <div className="student-preview-section-heading">
              {/* <span>Course plan</span> */}
              <h2>Course Content</h2>
            </div>

            {message ? <p className="student-preview-message">{message}</p> : null}

            {loadingLessons ? (
              <p className="student-preview-message">Loading curriculum...</p>
            ) : lessons.length > 0 ? (
              <div className="student-preview-lesson-list">
            {lessons.map((lesson, index) => (
              <article key={lesson.id} className="student-preview-lesson-card">
                <span>
                  <Milestone aria-hidden="true" />
                </span>
                <div>
                  <h3>
                    Lesson {index + 1}: {lesson.name}
                  </h3>
                  {lesson.summary ? <p>{lesson.summary}</p> : null}
                  <small>Course content</small>
                </div>
              </article>
            ))}
              </div>
            ) : (
              <p className="student-preview-message">
                No lessons have been added to this course yet.
              </p>
            )}
          </section>
        </div>

        <aside className="student-preview-side">
          <article className="student-preview-enroll-card">
            <span className="student-preview-style-pill">
              {course?.styleLabel || "Recommended"}
            </span>
            <h2>{course?.name || "Untitled Course"}</h2>
            <p>
              {course?.description ||
                "Explore this course preview and review the curriculum before enrolling."}
            </p>

            <div className="student-preview-price-grid">
              <div>
                <small>{isFree ? "Access" : "One-time payment"}</small>
                <strong>{amountLabel}</strong>
              </div>
              <div>
                <small>Enrollment</small>
                <strong>Lifetime Access</strong>
              </div>
            </div>

            <button type="button">Enroll Now</button>
          </article>

          <article className="student-preview-stats-card">
            <h3>Quick Stats</h3>
            <p>
              <Clock3 aria-hidden="true" />
              {lessons.length || 0} curriculum lessons
            </p>
            <p>
              <FileText aria-hidden="true" />
              Intro preview before enrollment
            </p>
            <p>
              <Sparkles aria-hidden="true" />
              Matched to your learning profile
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function mapPreviewLesson(row) {
  return {
    id: row?.lid || row?.name,
    name: row?.name || "Untitled Lesson",
    summary: row?.summary || "",
    number: Number(row?.number) || 0,
  };
}

function formatCourseAmount(amount) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return "Free";
  }

  return `${numericAmount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} LKR`;
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
