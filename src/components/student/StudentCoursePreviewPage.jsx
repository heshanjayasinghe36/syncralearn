import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Milestone,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import {
  clearPendingStripeCheckout,
  clearStripeCheckoutReturnParams,
  confirmStripeEnrollment,
  createStripeCheckoutSession,
  getStripeCheckoutReturnParams,
  setPendingStripeCheckout,
} from "../../lib/stripeCheckout";

export default function StudentCoursePreviewPage({
  course,
  session,
  studentProfile,
  returnView = "dashboard",
  onEnrollmentComplete,
  onBack,
}) {
  const [courseDetails, setCourseDetails] = useState(() => course || null);
  const [lessons, setLessons] = useState([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [checkingEnrollment, setCheckingEnrollment] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [message, setMessage] = useState("");
  const [enrollmentMessage, setEnrollmentMessage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewsMessage, setReviewsMessage] = useState("");
  const courseId = course?.cid || course?.id || null;
  const previewCourse = courseDetails || course || {};
  const courseDescription = previewCourse.description?.trim() || "";
  const previewVideo = getVideoPreview(
    previewCourse?.introVideoUrl || previewCourse?.intro_vid_url
  );
  const amountLabel = formatCourseAmount(previewCourse?.amount);
  const isFree = amountLabel === "Free";
  const processedStripeSessionRef = useRef(null);

  useEffect(() => {
    let ignore = false;

    async function loadCourseDetails() {
      setCourseDetails(course || null);

      if (!courseId || !supabase) {
        return;
      }

      const { data, error } = await supabase
        .from("course")
        .select(
          "cid, name, description, teachingstyle, amount, level, status, img_url, intro_vid_url"
        )
        .eq("cid", courseId)
        .maybeSingle();

      if (ignore || error || !data) {
        return;
      }

      setCourseDetails((currentCourse) => ({
        ...(currentCourse || {}),
        cid: data.cid,
        id: data.cid,
        name: data.name || currentCourse?.name || "Untitled Course",
        description: data.description || "",
        teachingstyle: data.teachingstyle || currentCourse?.teachingstyle || "",
        amount: data.amount,
        level: data.level || currentCourse?.level || "",
        status: data.status || currentCourse?.status || "",
        imgUrl: data.img_url || currentCourse?.imgUrl || "",
        introVideoUrl: data.intro_vid_url || "",
        intro_vid_url: data.intro_vid_url || "",
      }));
    }

    void loadCourseDetails();

    return () => {
      ignore = true;
    };
  }, [course, courseId]);

  useEffect(() => {
    let ignore = false;

    async function loadReviews() {
      if (!courseId || !supabase) {
        setReviews([]);
        setReviewsMessage(
          !supabase ? supabaseConfigError || "Supabase is not configured." : ""
        );
        return;
      }

      setLoadingReviews(true);
      setReviewsMessage("");

      const { data, error } = await supabase
        .from("review")
        .select("rid, rating, comment, date, time")
        .eq("cid", courseId)
        .order("date", { ascending: false })
        .order("time", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        setReviews([]);
        setReviewsMessage(`Reviews load failed: ${error.message}`);
      } else {
        setReviews(data || []);
      }

      setLoadingReviews(false);
    }

    void loadReviews();

    return () => {
      ignore = true;
    };
  }, [courseId]);

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

  useEffect(() => {
    let ignore = false;
    const checkoutReturn = getStripeCheckoutReturnParams();
    const isPendingStripeSuccessReturn =
      checkoutReturn?.status === "success" &&
      String(checkoutReturn?.courseId || "") === String(courseId);

    async function checkEnrollment() {
      if (!courseId || !supabase) {
        setIsEnrolled(false);
        return;
      }

      if (isPendingStripeSuccessReturn) {
        return;
      }

      setCheckingEnrollment(true);

      const sid = await resolveStudentId({ studentProfile, session });

      if (ignore) {
        return;
      }

      if (!sid) {
        setIsEnrolled(false);
        setCheckingEnrollment(false);
        return;
      }

      const { data, error } = await supabase
        .from("student_course")
        .select("sid, cid")
        .eq("sid", sid)
        .eq("cid", courseId)
        .maybeSingle();

      if (ignore) {
        return;
      }

      if (!error) {
        setIsEnrolled((current) => current || Boolean(data));
      }

      setCheckingEnrollment(false);
    }

    void checkEnrollment();

    return () => {
      ignore = true;
    };
  }, [courseId, session, studentProfile]);

  useEffect(() => {
    let ignore = false;
    const checkoutReturn = getStripeCheckoutReturnParams();

    async function handleStripeReturn() {
      if (!checkoutReturn || !courseId) {
        return;
      }

      if (String(checkoutReturn.courseId || "") !== String(courseId)) {
        return;
      }

      if (checkoutReturn.status === "cancelled") {
        setEnrollmentMessage(
          "Payment was cancelled. Enrollment was not completed."
        );
        clearPendingStripeCheckout();
        clearStripeCheckoutReturnParams();
        return;
      }

      if (
        checkoutReturn.status !== "success" ||
        !checkoutReturn.sessionId ||
        processedStripeSessionRef.current === checkoutReturn.sessionId
      ) {
        return;
      }

      processedStripeSessionRef.current = checkoutReturn.sessionId;
      setEnrolling(true);
      setEnrollmentMessage("Confirming payment...");

      const { data, error } = await confirmStripeEnrollment({
        courseId,
        sessionId: checkoutReturn.sessionId,
      });

      if (ignore) {
        return;
      }

      if (error) {
        setEnrollmentMessage(`Payment confirmation failed: ${error.message}`);
        setEnrolling(false);
        return;
      }

      if (data?.success) {
        setIsEnrolled(true);
        setEnrollmentMessage("Payment successful. Enrollment confirmed.");
        setEnrollModalOpen(false);
        clearPendingStripeCheckout();
        clearStripeCheckoutReturnParams();
        onEnrollmentComplete?.(courseId, {
          redirectToDashboard: true,
        });
      }

      setEnrolling(false);
    }

    void handleStripeReturn();

    return () => {
      ignore = true;
    };
  }, [courseId, onEnrollmentComplete]);

  async function handleConfirmEnrollment() {
    if (!courseId) {
      setEnrollmentMessage("Course ID was not found.");
      return;
    }

    if (!supabase) {
      setEnrollmentMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    const sid = await resolveStudentId({ studentProfile, session });

    if (!sid) {
      setEnrollmentMessage("Student profile was not found.");
      return;
    }

    setEnrolling(true);
    setEnrollmentMessage("");

    if (!isFree) {
      const returnUrl =
        typeof window === "undefined"
          ? ""
          : `${window.location.origin}${window.location.pathname}${window.location.search}`;

      const { data, error } = await createStripeCheckoutSession({
        courseId,
        returnUrl,
      });

      if (error) {
        setEnrollmentMessage(`Payment start failed: ${error.message}`);
        setEnrolling(false);
        return;
      }

      if (data?.alreadyEnrolled) {
        setIsEnrolled(true);
        setEnrollmentMessage("You are already enrolled in this course.");
        setEnrolling(false);
        setEnrollModalOpen(false);
        onEnrollmentComplete?.(courseId, {
          redirectToDashboard: true,
        });
        return;
      }

      if (!data?.checkoutUrl) {
        setEnrollmentMessage("Payment checkout could not be opened.");
        setEnrolling(false);
        return;
      }

      setPendingStripeCheckout({
        courseId,
        returnView,
        course,
      });

      window.location.assign(data.checkoutUrl);
      return;
    }

    const { error } = await supabase
      .from("student_course")
      .upsert(
        {
          sid,
          cid: courseId,
        },
        {
          onConflict: "sid,cid",
          ignoreDuplicates: true,
        }
      );

    if (error) {
      setEnrollmentMessage(`Enrollment failed: ${error.message}`);
      setEnrolling(false);
      return;
    }

    setIsEnrolled(true);
    setEnrollmentMessage("Enrollment confirmed.");
    setEnrolling(false);
    setEnrollModalOpen(false);
    onEnrollmentComplete?.(courseId, {
      redirectToDashboard: true,
    });
  }

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
                  title={`${previewCourse?.name || "Course"} introduction video`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video controls src={previewVideo.src}>
                  <track kind="captions" />
                </video>
              )
            ) : previewCourse?.imgUrl ? (
              <img src={previewCourse.imgUrl} alt="" />
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
              <Sparkles aria-hidden="true" />
              {previewCourse?.styleLabel || "Recommended"}
            </span>
            <h2>{previewCourse?.name || "Untitled Course"}</h2>
            {courseDescription ? <p>{courseDescription}</p> : null}

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

            <button
              type="button"
              onClick={() => {
                setEnrollmentMessage("");
                setEnrollModalOpen(true);
              }}
              disabled={checkingEnrollment || isEnrolled}
            >
              {checkingEnrollment
                ? "Checking..."
                : isEnrolled
                  ? "Enrolled"
                  : "Enroll Now"}
            </button>

            {isEnrolled ? (
              <p className="student-preview-enrolled-note">
                You are already enrolled in this course.
              </p>
            ) : null}

            {!enrollModalOpen && enrollmentMessage ? (
              <p className="student-preview-message">{enrollmentMessage}</p>
            ) : null}
          </article>

          {/* <article className="student-preview-stats-card">
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
          </article> */}

          {loadingReviews ? (
            <article className="student-preview-reviews-card">
              <h3>Student Reviews</h3>
              <p>Loading reviews...</p>
            </article>
          ) : reviewsMessage ? (
            <article className="student-preview-reviews-card">
              <h3>Student Reviews</h3>
              <p>{reviewsMessage}</p>
            </article>
          ) : reviews.length > 0 ? (
            <article className="student-preview-reviews-card">
              <h3>Student Reviews</h3>
              {reviews.map((review, index) => (
                <div className="student-preview-review-item" key={review.rid || `${review.date}-${index}`}>
                  <div className="student-preview-review-rating">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star
                        key={starIndex}
                        className={
                          starIndex < Number(review.rating)
                            ? "active"
                            : ""
                        }
                        aria-hidden="true"
                      />
                    ))}
                    <span>{Number(review.rating)}/5</span>
                  </div>
                  <p>{review.comment}</p>
                  <small>{review.date || review.time}</small>
                </div>
              ))}
            </article>
          ) : null}
        </aside>
      </div>

      {enrollModalOpen ? (
        <EnrollmentModal
          course={previewCourse}
          amountLabel={amountLabel}
          isFree={isFree}
          lessonCount={lessons.length}
          courseAmount={previewCourse?.amount}
          message={enrollmentMessage}
          enrolling={enrolling}
          onClose={() => {
            if (!enrolling) {
              setEnrollModalOpen(false);
            }
          }}
          onConfirm={handleConfirmEnrollment}
        />
      ) : null}
    </section>
  );
}

function EnrollmentModal({
  course,
  amountLabel,
  isFree,
  courseAmount,
  lessonCount,
  message,
  enrolling,
  onClose,
  onConfirm,
}) {
  return (
    <div className="student-enroll-modal-backdrop">
      <article className="student-enroll-modal" aria-label="Confirm enrollment">
        <div className="student-enroll-modal-header">
          <div>
            <span>Enrollment</span>
            <h3>Confirm your course</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={enrolling}
            aria-label="Close enrollment popup"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="student-enroll-summary">
          <span>
            <CheckCircle2 aria-hidden="true" />
          </span>
          <div>
            <h4>{course?.name || "Untitled Course"}</h4>
            <p>
              You will get lifetime access to the course content after
              enrollment.
            </p>
          </div>
        </div>

        <div className="student-enroll-details">
          <div>
            <small>{isFree ? "Access" : "Payment"}</small>
            <strong>{amountLabel}</strong>
          </div>
          <div>
            <small>Lessons</small>
            <strong>{lessonCount || 0}</strong>
          </div>
          <div>
            <small>Status</small>
            <strong>Lifetime Access</strong>
          </div>
        </div>

        {!isFree && Number(courseAmount) > 0 ? (
          <p className="student-enroll-message">
            Checkout will open in a secure payment page.
          </p>
        ) : null}

        {message ? <p className="student-enroll-message">{message}</p> : null}

        <button
          type="button"
          className="student-enroll-confirm"
          onClick={onConfirm}
          disabled={enrolling}
        >
          {enrolling
            ? isFree
              ? "Confirming..."
              : "Redirecting..."
            : isFree
              ? "Confirm Enrollment"
              : "Proceed to Payment"}
        </button>
      </article>
    </div>
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

async function resolveStudentId({ studentProfile, session }) {
  if (studentProfile?.sid) {
    return studentProfile.sid;
  }

  if (!session?.user?.id || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("student")
    .select("sid")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.sid || null;
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
