import { useEffect, useState } from "react";
import {
  Banknote,
  Bell,
  BookOpen,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import { getVarkStyleKeys, getVarkStyleLabel } from "../../lib/vark";
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
}) {
  const [activeView, setActiveView] = useState("dashboard");
  const [localStudentProfile, setLocalStudentProfile] = useState(studentProfile);
  const [suggestedCourses, setSuggestedCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const effectiveStudentProfile = localStudentProfile || studentProfile;
  const displayName =
    effectiveStudentProfile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email?.split("@")[0] ||
    "Student";
  const initials = getInitials(displayName);
  const learningStyle = effectiveStudentProfile?.mls || "";

  function handleStudentProfileUpdate(nextProfile) {
    setLocalStudentProfile(nextProfile);
    onStudentProfileUpdate?.(nextProfile);
  }

  useEffect(() => {
    setLocalStudentProfile(studentProfile);
  }, [studentProfile]);

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
  }, [learningStyle]);

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
                setActiveView(id);
              }}
              className={`teacher-sidebar-link ${
                activeView === id ||
                (id === "courses" && activeView === "course-preview")
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

            <div className="teacher-profile-chip">
              <div className="teacher-avatar" aria-label={displayName}>
                {initials}
              </div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="teacher-signout-button"
            >
              Sign out
            </button>
          </div>
        </header>

        <main
          className="teacher-dashboard-empty student-dashboard-content"
          aria-label={`${activeView} content`}
        >
          {activeView === "course-preview" && selectedCourse ? (
            <StudentCoursePreviewPage
              course={selectedCourse}
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
            />
          ) : activeView === "dashboard" || activeView === "courses" ? (
            <section className="student-suggestions-section">
              <div className="student-suggestions-header">
                <div>
                  <span>
                    <Sparkles aria-hidden="true" />
                    Matched for your style
                  </span>
                  <h2>Suggested Courses</h2>
                </div>
              </div>

              {loadingSuggestions ? (
                <p className="student-suggestion-state">
                  Loading suggested courses...
                </p>
              ) : suggestionMessage ? (
                <p className="student-suggestion-state">{suggestionMessage}</p>
              ) : (
                <div className="student-suggestion-grid">
                  {suggestedCourses.map((course) => (
                    <article
                      key={course.id}
                      className="student-course-card"
                      tabIndex={0}
                      role="button"
                      onClick={() => {
                        setSelectedCourse(course);
                        setActiveView("course-preview");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCourse(course);
                          setActiveView("course-preview");
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

                        {course.description ? (
                          <small>{course.description}</small>
                        ) : null}

                        <div className="student-course-meta">
                          <span>
                            <Banknote aria-hidden="true" />
                            {formatCourseAmount(course.amount)}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </main>
      </section>
    </div>
  );
}

function mapSuggestedCourse(row) {
  return {
    id: row?.cid,
    name: row?.name || "Untitled Course",
    description: row?.description || "",
    teachingstyle: row?.teachingstyle || "",
    styleLabel: formatLearningStyle(row?.teachingstyle),
    amount: row?.amount,
    levelLabel: formatCourseLevel(row?.level),
    imgUrl: row?.img_url || "",
    introVideoUrl: row?.intro_vid_url || "",
    intro_vid_url: row?.intro_vid_url || "",
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
