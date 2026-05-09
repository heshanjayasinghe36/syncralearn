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
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import { getVarkStyleKeys, getVarkStyleLabel } from "../../lib/vark";
import StudentCourseLearningPage from "./StudentCourseLearningPage";
import StudentCoursePreviewPage from "./StudentCoursePreviewPage";
import StudentSettingsPage from "./StudentSettingsPage";

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
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingEnrolledCourses, setLoadingEnrolledCourses] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [enrolledCoursesMessage, setEnrolledCoursesMessage] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
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

  useEffect(() => {
    function handlePointerDown(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
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
            intro_vid_url
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
          "cid, name, description, teachingstyle, amount, level, status, img_url, intro_vid_url"
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

            <div
              className="student-profile-menu-wrap"
              ref={profileMenuRef}
            >
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
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CourseCard({ course, onOpenCourse }) {
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
          </div>
        ) : null}

        {course.enrolledAt ? (
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
        ) : null}
      </div>
    </article>
  );
}

function mapSuggestedCourse(row, enrolledAt = null, progress = {}) {
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
