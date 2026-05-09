import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Bell,
  BookOpen,
  Flame,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Star,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import { getVarkStyleKeys, getVarkStyleLabel } from "../../lib/vark";
import StudentCourseLearningPage from "./StudentCourseLearningPage";
import StudentCoursePreviewPage from "./StudentCoursePreviewPage";
import StudentSettingsPage from "./StudentSettingsPage";
import StudentStudyPlanPage from "./StudentStudyPlanPage";

const sidebarItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard aria-hidden="true" />,
  },
  {
    id: "courses",
    label: "Courses",
    icon: <BookOpen aria-hidden="true" />,
  },
  {
    id: "study-plan",
    label: "Study Plan",
    icon: <Sparkles aria-hidden="true" />,
  },
];

export default function StudentDashboard({
  session,
  onSignOut,
  studentProfile,
  onStudentProfileUpdate,
  theme,
  onToggleTheme,
}) {
  const [activeView, setActiveView] = useState("dashboard");
  const [localStudentProfile, setLocalStudentProfile] = useState(studentProfile);
  const [suggestedCourses, setSuggestedCourses] = useState([]);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [savedCourseLessonSelection, setSavedCourseLessonSelection] = useState({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingEnrolledCourses, setLoadingEnrolledCourses] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [enrolledCoursesMessage, setEnrolledCoursesMessage] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [reviewPopup, setReviewPopup] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");

  const profileMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);

  const effectiveStudentProfile = localStudentProfile || studentProfile;

  const displayName =
    effectiveStudentProfile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email?.split("@")[0] ||
    "Student";

  const initials = getInitials(displayName);
  const learningStyle = effectiveStudentProfile?.mls || "";
  const studentId = effectiveStudentProfile?.sid || null;

  function handleStudentProfileUpdate(nextProfile) {
    setLocalStudentProfile(nextProfile);
    onStudentProfileUpdate?.(nextProfile);
  }

  useEffect(() => {
    setLocalStudentProfile(studentProfile);
  }, [studentProfile]);

  async function deleteNotification(nid) {
    if (!supabase || !nid) {
      return;
    }

    const { error } = await supabase
      .from("student_notification")
      .delete()
      .eq("nid", nid);

    if (error) {
      console.warn("Failed to delete notification:", error.message);
      return;
    }

    setNotifications((prev) =>
      prev.filter((notification) => notification.nid !== nid)
    );
  }

  useEffect(() => {
    let ignore = false;

    async function loadNotifications() {
      if (!supabase || !studentId) {
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from("student_notification")
        .select("*")
        .eq("sid", studentId)
        .order("created_at", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        console.warn("Notifications load failed:", error.message);
        setNotifications([]);
      } else {
        setNotifications(data || []);
      }
    }

    void loadNotifications();

    return () => {
      ignore = true;
    };
  }, [studentId]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }

      if (!notificationMenuRef.current?.contains(event.target)) {
        setNotificationMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadEnrolledCourses() {
      if (!supabase) {
        setEnrolledCourses([]);
        setEnrolledCoursesMessage(
          supabaseConfigError || "Supabase is not configured."
        );
        return;
      }

      if (!studentId) {
        setEnrolledCourses([]);
        setEnrolledCoursesMessage("");
        return;
      }

      setLoadingEnrolledCourses(true);
      setEnrolledCoursesMessage("");

      const { data, error } = await supabase
        .from("student_course")
        .select(
          `
          enrolled_at,
          progress_percent,
          completed,
          course (
            cid,
            name,
            description,
            teachingstyle,
            amount,
            level,
            status,
            img_url,
            intro_vid_url,
            review (
              rating
            )
          )
        `
        )
        .eq("sid", studentId)
        .order("enrolled_at", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        setEnrolledCourses([]);
        setEnrolledCoursesMessage(
          `Enrolled courses load failed: ${error.message}`
        );
      } else {
        const mappedCourses = (data || [])
          .map((row) =>
            mapSuggestedCourse(row.course, row.enrolled_at, {
              progressPercent: row.progress_percent,
              completed: row.completed,
            })
          )
          .filter((course) => course.id);

        setEnrolledCourses(mappedCourses);
        setEnrolledCoursesMessage("");
      }

      setLoadingEnrolledCourses(false);
    }

    void loadEnrolledCourses();

    return () => {
      ignore = true;
    };
  }, [studentId]);

  useEffect(() => {
    let ignore = false;

    async function loadSuggestedCourses() {
      const studentStyleKeys = getVarkStyleKeys(learningStyle);

      if (!supabase) {
        setSuggestedCourses([]);
        setSuggestionMessage(supabaseConfigError || "Supabase is not configured.");
        return;
      }

      if (studentStyleKeys.length === 0) {
        setSuggestedCourses([]);
        setSuggestionMessage(
          "Complete your VARK profile to get course suggestions."
        );
        return;
      }

      setLoadingSuggestions(true);
      setSuggestionMessage("");

      const { data, error } = await supabase
        .from("course")
        .select(
          `
          cid,
          name,
          description,
          teachingstyle,
          amount,
          level,
          status,
          img_url,
          intro_vid_url,
          review (
            rating
          )
        `
        )
        .ilike("status", "active")
        .order("cid", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        setSuggestedCourses([]);
        setSuggestionMessage(`Suggested courses load failed: ${error.message}`);
      } else {
        const matchedCourses = (data || [])
          .filter((course) =>
            hasMatchingLearningStyle(studentStyleKeys, course.teachingstyle)
          )
          .filter(
            (course) =>
              !enrolledCourses.some(
                (enrolledCourse) => enrolledCourse.id === course.cid
              )
          )
          .map(mapSuggestedCourse);

        setSuggestedCourses(matchedCourses);
        setSuggestionMessage(
          matchedCourses.length === 0
            ? `No active courses match ${formatLearningStyle(learningStyle)} yet.`
            : ""
        );
      }

      setLoadingSuggestions(false);
    }

    void loadSuggestedCourses();

    return () => {
      ignore = true;
    };
  }, [enrolledCourses, learningStyle]);

  if (activeView === "enrolled-course-preview" && selectedCourse) {
    return (
      <StudentCourseLearningPage
        course={selectedCourse}
        displayName={displayName}
        studentId={studentId}
        initialLessonId={savedCourseLessonSelection[selectedCourse.id]}
        onLessonSelect={(lessonId) => {
          if (!selectedCourse?.id) {
            return;
          }

          setSavedCourseLessonSelection((current) => ({
            ...current,
            [selectedCourse.id]: lessonId,
          }));
        }}
        onBack={() => {
          setSelectedCourse(null);
          setActiveView("dashboard");
        }}
      />
    );
  }

  return (
    <div className="teacher-dashboard-shell">
      <aside className="teacher-sidebar">
        <div className="teacher-sidebar-brand">
          <div className="teacher-brand-mark">
            <GraduationCap aria-hidden="true" />
          </div>

          <div>
            <p className="teacher-brand-name">Syncra Learn</p>
            <p className="teacher-brand-kicker">Student Portal</p>
          </div>
        </div>

        <nav className="teacher-sidebar-nav" aria-label="Student dashboard">
          {sidebarItems.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelectedCourse(null);
                setProfileMenuOpen(false);
                setActiveView(id);
              }}
              className={`teacher-sidebar-link ${
                activeView === id ||
                (id === "courses" &&
                  (activeView === "course-preview" ||
                    activeView === "enrolled-course-preview"))
                  ? "is-active"
                  : ""
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={`teacher-sidebar-link student-sidebar-settings ${
            activeView === "settings" ? "is-active" : ""
          }`}
          onClick={() => {
            setSelectedCourse(null);
            setProfileMenuOpen(false);
            setActiveView("settings");
          }}
        >
          <Settings aria-hidden="true" />
          <span>Settings</span>
        </button>
      </aside>

      <section className="teacher-dashboard-main">
        <header className="teacher-topbar">
          <h1>Welcome, {displayName}</h1>

          <label className="teacher-search">
            <Search aria-hidden="true" />
            <input type="search" placeholder="Search courses..." />
          </label>

          <div className="teacher-topbar-actions">
            <div
              className="student-notification-menu-wrap"
              ref={notificationMenuRef}
            >
              <button
                type="button"
                className="teacher-icon-button"
                aria-label="Notifications"
                onClick={() => {
                  setNotificationMenuOpen((open) => !open);
                  setProfileMenuOpen(false);
                }}
              >
                <Bell aria-hidden="true" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="notification-badge">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </button>

              {notificationMenuOpen ? (
                <div className="student-notification-menu" role="menu">
                  {notifications.length === 0 ? (
                    <p>No notifications yet.</p>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.nid}
                        className={`student-notification-item ${
                          notification.read ? "read" : "unread"
                        }`}
                        role="group"
                      >
                        <button
                          type="button"
                          className="student-notification-item-body"
                          onClick={() => {
                            if (notification.type === "course_completion") {
                              setReviewPopup({
                                courseId: notification.data?.course_id,
                                courseName:
                                  notification.title.match(/completed (.+)\./)?.[1] ||
                                  "Course",
                              });
                              setNotificationMenuOpen(false);
                            }

                            supabase
                              .from("student_notification")
                              .update({ read: true })
                              .eq("nid", notification.nid)
                              .then(() => {
                                setNotifications((prev) =>
                                  prev.map((n) =>
                                    n.nid === notification.nid
                                      ? { ...n, read: true }
                                      : n
                                  )
                                );
                              });
                          }}
                        >
                          <strong>{notification.title}</strong>
                          <p>{notification.message}</p>
                        </button>

                        <button
                          type="button"
                          className="student-notification-clear"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteNotification(notification.nid);
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="student-streak-chip" aria-label="Learning streak">
              <Flame aria-hidden="true" />
              <span>0</span>
            </div>

            <div className="student-profile-menu-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className="student-profile-trigger"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-label={`${displayName} profile menu`}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
              >
                <span className="student-topbar-avatar">{initials}</span>
              </button>

              {profileMenuOpen ? (
                <div className="student-profile-menu" role="menu">
                  <div>
                    <strong>{displayName}</strong>
                    <span>{effectiveStudentProfile?.email || session?.user?.email}</span>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onSignOut?.();
                    }}
                  >
                    <LogOut aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main
          className="teacher-dashboard-empty student-dashboard-content"
          aria-label={`${activeView} content`}
        >
          {activeView === "course-preview" && selectedCourse ? (
            <StudentCoursePreviewPage
              course={selectedCourse}
              session={session}
              studentProfile={effectiveStudentProfile}
              onBack={() => {
                setSelectedCourse(null);
                setActiveView("courses");
              }}
            />
          ) : activeView === "settings" ? (
            <StudentSettingsPage
              session={session}
              studentProfile={effectiveStudentProfile}
              onProfileUpdate={handleStudentProfileUpdate}
              theme={theme}
              onToggleTheme={onToggleTheme}
            />
          ) : activeView === "study-plan" ? (
            <StudentStudyPlanPage />
          ) : activeView === "dashboard" || activeView === "courses" ? (
            <div className="student-dashboard-course-sections">
              <CourseSection
                badge="Your learning"
                title="Enrolled Courses"
                icon={<BookOpen aria-hidden="true" />}
                courses={enrolledCourses}
                loading={loadingEnrolledCourses}
                loadingText="Loading enrolled courses..."
                message={
                  enrolledCoursesMessage ||
                  (enrolledCourses.length === 0
                    ? "You have not enrolled in any courses yet."
                    : "")
                }
                onOpenCourse={(course) => {
                  setSelectedCourse(course);
                  setActiveView("enrolled-course-preview");
                }}
                onAddReview={(course) => {
                  setReviewPopup({
                    courseId: course.cid,
                    courseName: course.name,
                  });
                }}
              />

              <CourseSection
                badge="Matched for your style"
                title="Suggested Courses"
                icon={<Sparkles aria-hidden="true" />}
                courses={suggestedCourses}
                loading={loadingSuggestions}
                loadingText="Loading suggested courses..."
                message={suggestionMessage}
                onOpenCourse={(course) => {
                  setSelectedCourse(course);
                  setActiveView("course-preview");
                }}
              />
            </div>
          ) : null}
        </main>
      </section>

      {reviewPopup && (
        <div className="review-popup-overlay" onClick={() => setReviewPopup(null)}>
          <div className="review-popup" onClick={(e) => e.stopPropagation()}>
            <h3>Review {reviewPopup.courseName}</h3>

            <div className="review-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  className={star <= reviewRating ? "active" : ""}
                >
                  <Star aria-hidden="true" />
                </button>
              ))}
            </div>

            <textarea
              placeholder="Write your review..."
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
            />

            <div className="review-actions">
              <button type="button" onClick={() => setReviewPopup(null)}>
                Cancel
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (reviewRating === 0) {
                    alert("Please select a rating.");
                    return;
                  }

                  const { error } = await supabase.from("review").insert({
                    sid: studentId,
                    cid: reviewPopup.courseId,
                    rating: reviewRating,
                    comment: reviewComment,
                    date: new Date().toISOString().split("T")[0],
                    time: new Date().toTimeString().split(" ")[0],
                  });

                  if (error) {
                    alert("Failed to submit review: " + error.message);
                  } else {
                    alert("Review submitted successfully!");
                    setReviewPopup(null);
                    setReviewRating(0);
                    setReviewComment("");
                  }
                }}
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseSection({
  badge,
  title,
  icon,
  courses,
  loading,
  loadingText,
  message,
  onOpenCourse,
  onAddReview,
}) {
  return (
    <section className="student-suggestions-section">
      <div className="student-suggestions-header">
        <div>
          <span>
            {icon}
            {badge}
          </span>
          <h2>{title}</h2>
        </div>
      </div>

      {loading ? (
        <p className="student-suggestion-state">{loadingText}</p>
      ) : message ? (
        <p className="student-suggestion-state">{message}</p>
      ) : (
        <div className="student-suggestion-grid">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onOpenCourse={onOpenCourse}
              onAddReview={onAddReview}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CourseCard({ course, onOpenCourse, onAddReview }) {
  return (
    <article
      className="student-course-card"
      tabIndex={0}
      role="button"
      onClick={() => onOpenCourse(course)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenCourse(course);
        }
      }}
    >
      <div className="student-course-visual">
        {course.imgUrl ? (
          <img src={course.imgUrl} alt="" />
        ) : (
          <BookOpen aria-hidden="true" />
        )}
        <span>{course.styleLabel}</span>
      </div>

      <div className="student-course-body">
        <div>
          <p>{course.levelLabel}</p>
          <h3>{course.name}</h3>
        </div>

        {!course.enrolledAt && course.description ? (
          <small>{course.description}</small>
        ) : null}

        {!course.enrolledAt ? (
          <div className="student-course-meta">
            <span>
              <Banknote aria-hidden="true" />
              {formatCourseAmount(course.amount)}
            </span>

            <span className="student-course-rating">
              <Star aria-hidden="true" />
              {course.ratingCount > 0
                ? `${course.averageRating.toFixed(1)} (${course.ratingCount})`
                : "No ratings"}
            </span>
          </div>
        ) : null}

        {course.enrolledAt ? (
          <>
            <div className="student-course-progress-block">
              <div className="student-course-progress-label">
                <span>Course Completion</span>
                <strong>{Number(course.progressPercent || 0)}%</strong>
              </div>

              <div className="student-course-progress">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, Number(course.progressPercent || 0))
                    )}%`,
                  }}
                />
              </div>
            </div>

            {onAddReview && Number(course.progressPercent || 0) === 100 ? (
              <button
                type="button"
                className="student-course-review-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddReview(course);
                }}
              >
                Add Review
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function mapSuggestedCourse(row, enrolledAt = null, progress = {}) {
  const reviews = row?.review || [];
  const ratingCount = reviews.length;

  const averageRating =
    ratingCount > 0
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
        ratingCount
      : 0;

  return {
    id: row?.cid,
    cid: row?.cid,
    name: row?.name || "Untitled Course",
    description: row?.description || "",
    teachingstyle: row?.teachingstyle || "",
    styleLabel: formatLearningStyle(row?.teachingstyle),
    amount: row?.amount,
    levelLabel: formatCourseLevel(row?.level),
    imgUrl: row?.img_url || "",
    introVideoUrl: row?.intro_vid_url || "",
    intro_vid_url: row?.intro_vid_url || "",
    enrolledAt,
    progressPercent: progress.progressPercent ?? 0,
    completed: progress.completed || false,
    averageRating,
    ratingCount,
  };
}

function hasMatchingLearningStyle(studentStyleKeys, teachingstyle) {
  const courseStyleKeys = getVarkStyleKeys(teachingstyle);

  if (courseStyleKeys.length === 0) {
    return false;
  }

  return courseStyleKeys.some((styleKey) => studentStyleKeys.includes(styleKey));
}

function formatLearningStyle(value) {
  return getVarkStyleLabel(value);
}

function formatCourseLevel(level) {
  if (!level) {
    return "All levels";
  }

  return String(level)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}