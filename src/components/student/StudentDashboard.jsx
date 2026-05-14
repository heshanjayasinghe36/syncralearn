import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Bell,
  BookOpen,
  Clock,
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
import StudentCoursesPage from "./StudentCoursesPage";
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
  const [courseReturnView, setCourseReturnView] = useState("dashboard");
  const [savedCourseLessonSelection, setSavedCourseLessonSelection] = useState({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingEnrolledCourses, setLoadingEnrolledCourses] = useState(false);
  const [searchCatalogCourses, setSearchCatalogCourses] = useState([]);
  const [loadingSearchCatalog, setLoadingSearchCatalog] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [enrolledCoursesMessage, setEnrolledCoursesMessage] = useState("");
  const [studyPlanCard, setStudyPlanCard] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [reviewPopup, setReviewPopup] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const profileMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const searchRef = useRef(null);
  const streakSyncedStudentIdRef = useRef(null);

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
  const currentStreak = Number(effectiveStudentProfile?.current_streak || 0);

  function handleStudentProfileUpdate(nextProfile) {
    setLocalStudentProfile(nextProfile);
    onStudentProfileUpdate?.(nextProfile);
  }

  useEffect(() => {
    setLocalStudentProfile(studentProfile);
  }, [studentProfile]);

  useEffect(() => {
    let ignore = false;

    async function syncStudentStreak() {
      if (!supabase || !studentId || streakSyncedStudentIdRef.current === studentId) {
        return;
      }

      streakSyncedStudentIdRef.current = studentId;

      const streakUpdate = getNextStudentStreak(effectiveStudentProfile);

      const { data, error } = await supabase
        .from("student")
        .update({
          current_streak: streakUpdate.currentStreak,
          longest_streak: streakUpdate.longestStreak,
          last_active_date: streakUpdate.today,
          last_active_at: new Date().toISOString(),
        })
        .eq("sid", studentId)
        .select("*")
        .maybeSingle();

      if (ignore) {
        return;
      }

      if (error) {
        console.warn("Student streak update failed:", error.message);
        return;
      }

      if (data) {
        handleStudentProfileUpdate(data);
      }
    }

    void syncStudentStreak();

    return () => {
      ignore = true;
    };
  }, [effectiveStudentProfile, studentId]);

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

      if (!searchRef.current?.contains(event.target)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadStudyPlanCard() {
      if (!supabase || !studentId) {
        setStudyPlanCard(null);
        return;
      }

      const { data, error } = await supabase
        .from("student_study_plan")
        .select("plan_json, generated_at")
        .eq("sid", studentId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ignore) {
        return;
      }

      if (error) {
        console.warn("Study plan load failed:", error.message);
        setStudyPlanCard(null);
        return;
      }

      if (!data?.plan_json) {
        setStudyPlanCard(null);
        return;
      }

      setStudyPlanCard({
        weeklyGoal: data.plan_json.weeklyGoal || "",
        totalStudyHours: Number(data.plan_json.totalStudyHours || 0),
        nextSession: getNextStudyTask(data.plan_json),
      });
    }

    void loadStudyPlanCard();

    return () => {
      ignore = true;
    };
  }, [studentId]);

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

  useEffect(() => {
    let ignore = false;

    async function loadSearchCatalog() {
      if (!supabase) {
        setSearchCatalogCourses([]);
        return;
      }

      setLoadingSearchCatalog(true);

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
          tid,
          teacher (
            full_name
          ),
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
        console.warn("Search catalog load failed:", error.message);
        setSearchCatalogCourses([]);
      } else {
        const enrolledCourseMap = new Map(
          enrolledCourses.map((course) => [course.id, course])
        );

        setSearchCatalogCourses(
          (data || [])
            .map((row) => {
              const enrolledCourse = enrolledCourseMap.get(row.cid);

              return mapSuggestedCourse(
                row,
                enrolledCourse?.enrolledAt ?? null,
                {
                  progressPercent: enrolledCourse?.progressPercent ?? 0,
                  completed: enrolledCourse?.completed ?? false,
                }
              );
            })
            .filter((course) => course.id)
        );
      }

      setLoadingSearchCatalog(false);
    }

    void loadSearchCatalog();

    return () => {
      ignore = true;
    };
  }, [enrolledCourses]);

  const searchResults = getStudentSearchResults(
    searchCatalogCourses,
    searchQuery,
    learningStyle
  );

  function openCourseFromSearch(course) {
    setCourseReturnView(activeView);
    setSelectedCourse(course);
    setSearchOpen(false);
    setSearchQuery("");
    setActiveView(course.isEnrolled ? "enrolled-course-preview" : "course-preview");
  }

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
          setActiveView(courseReturnView);
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

          <div className="teacher-search student-course-search" ref={searchRef}>
            <Search aria-hidden="true" />
            <input
              type="search"
              placeholder="Search courses or teachers..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
            />

            {searchOpen ? (
              <div className="student-search-popup" role="listbox">
                {loadingSearchCatalog ? (
                  <p className="student-search-state">Loading courses...</p>
                ) : searchCatalogCourses.length === 0 ? (
                  <p className="student-search-state">No active courses available.</p>
                ) : searchResults.length === 0 ? (
                  <p className="student-search-state">
                    No courses match that course or teacher name.
                  </p>
                ) : (
                  <div className="student-search-results">
                    {searchResults.map((course) => (
                      <button
                        key={`search-${course.id}`}
                        type="button"
                        className="student-search-result"
                        onClick={() => openCourseFromSearch(course)}
                      >
                        <div className="student-search-result-visual">
                          {course.imgUrl ? (
                            <img src={course.imgUrl} alt="" />
                          ) : (
                            <BookOpen aria-hidden="true" />
                          )}
                        </div>

                        <div className="student-search-result-body">
                          <div className="student-search-result-topline">
                            <span>{course.levelLabel}</span>
                            {course.isEnrolled ? (
                              <strong>Enrolled</strong>
                            ) : hasMatchingLearningStyle(
                                getVarkStyleKeys(learningStyle),
                                course.teachingstyle
                              ) ? (
                              <strong>Style match</strong>
                            ) : null}
                          </div>

                          <h3>{course.name}</h3>
                          <p>{course.teacherName || "Unknown teacher"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

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
              <span>{currentStreak}</span>
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
                setActiveView(courseReturnView);
              }}
            />
          ) : activeView === "courses" ? (
            <StudentCoursesPage
              courses={enrolledCourses}
              loading={loadingEnrolledCourses}
              message={
                enrolledCoursesMessage ||
                (enrolledCourses.length === 0
                  ? "You have not enrolled in any courses yet."
                  : "")
              }
              onOpenCourse={(course) => {
                setCourseReturnView("courses");
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
          ) : activeView === "dashboard" ? (
            <div
              className={`student-dashboard-overview ${
                studyPlanCard ? "has-next-task" : "no-next-task"
              }`}
            >
              <div className="student-dashboard-scroll-column">
                <CourseSection
                  className="student-continue-section"
                  badge="Your learning"
                  title="Continue Learning"
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
                    setCourseReturnView("dashboard");
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
                  className="student-suggested-section"
                  badge="Matched for your style"
                  title="Suggested Courses"
                  icon={<Sparkles aria-hidden="true" />}
                  courses={suggestedCourses}
                  forcePreviewDetails
                  loading={loadingSuggestions}
                  loadingText="Loading suggested courses..."
                  message={suggestionMessage}
                  onOpenCourse={(course) => {
                    setCourseReturnView("dashboard");
                    setSelectedCourse(course);
                    setActiveView("course-preview");
                  }}
                />
              </div>

              <div className="student-dashboard-right-column">
                {studyPlanCard ? (
                  <NextStudyTaskCard
                    studyPlanCard={studyPlanCard}
                    onOpenPlan={() => setActiveView("study-plan")}
                  />
                ) : null}

                <DailyStreakCard currentStreak={currentStreak} />
              </div>
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

function DailyStreakCard({ currentStreak }) {
  const monthStreak = getMonthStreakDays(currentStreak);

  return (
    <section className="student-daily-streak-card" aria-label="Daily streak">
      <div className="student-daily-streak-heading">
        <span>
          <Flame aria-hidden="true" />
        </span>
        <div>
          <p>Daily Streak</p>
          <strong>{currentStreak} day streak</strong>
        </div>
      </div>

      <div className="student-daily-streak-month">
        <span>{monthStreak.monthLabel}</span>
        <small>Current month</small>
      </div>

      <div className="student-daily-streak-weekdays" aria-hidden="true">
        {monthStreak.weekdays.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>

      <div
        className="student-daily-streak-calendar"
        aria-label={`Streak for ${monthStreak.monthLabel}`}
      >
        {monthStreak.days.map((day) => (
          <div
            key={day.key}
            className={`student-streak-day ${
              day.isPlaceholder ? "is-placeholder" : ""
            } ${day.active ? "is-active" : ""} ${day.isToday ? "is-today" : ""}`}
          >
            <span>{day.isPlaceholder ? "" : day.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function NextStudyTaskCard({ studyPlanCard, onOpenPlan }) {
  const nextSession = studyPlanCard?.nextSession;

  return (
    <section className="student-next-task-card" aria-label="Next study task">
      <div className="student-next-task-heading">
        <span>
          <Clock aria-hidden="true" />
        </span>
        <div>
          <p>What to do next</p>
          <strong>
            {nextSession ? nextSession.relativeLabel : "Study plan ready"}
          </strong>
        </div>
      </div>

      {nextSession ? (
        <>
          <div className="student-next-task-meta">
            <span>{nextSession.dayLabel}</span>
            <span>{nextSession.timeLabel}</span>
          </div>

          <h3>{nextSession.taskTitle}</h3>
          <p>
            {nextSession.courseName} • {formatActivityType(nextSession.activityType)}
          </p>

          {nextSession.taskDescription ? (
            <small>{nextSession.taskDescription}</small>
          ) : null}
        </>
      ) : (
        <>
          <h3>No sessions left this week</h3>
          <p>{studyPlanCard?.weeklyGoal || "Your next study cycle is ready to review."}</p>
          {studyPlanCard?.totalStudyHours > 0 ? (
            <small>{studyPlanCard.totalStudyHours} planned study hours this week.</small>
          ) : null}
        </>
      )}

      <button
        type="button"
        className="student-next-task-button"
        onClick={onOpenPlan}
      >
        Open Study Plan
      </button>
    </section>
  );
}

function CourseSection({
  className = "",
  badge,
  title,
  icon,
  courses,
  forcePreviewDetails = false,
  loading,
  loadingText,
  message,
  onOpenCourse,
  onAddReview,
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = courses.length > 3;
  const visibleCourses = expanded ? courses : courses.slice(0, 3);

  return (
    <section className={`student-suggestions-section ${className}`}>
      <div className="student-suggestions-header">
        <div>
          <div className="student-suggestions-header-top">
            <span>
              {icon}
              {badge}
            </span>
            {canExpand ? (
              <button
                type="button"
                className="student-suggestions-toggle"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? "See less" : "See more"}
              </button>
            ) : null}
          </div>
          <h2>{title}</h2>
        </div>
      </div>

      {loading ? (
        <p className="student-suggestion-state">{loadingText}</p>
      ) : message ? (
        <p className="student-suggestion-state">{message}</p>
      ) : (
        <div className="student-suggestion-grid">
          {visibleCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              forcePreviewDetails={forcePreviewDetails}
              onOpenCourse={onOpenCourse}
              onAddReview={onAddReview}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CourseCard({ course, forcePreviewDetails = false, onOpenCourse, onAddReview }) {
  const showPreviewDetails = forcePreviewDetails || !course.isEnrolled;

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

        {showPreviewDetails && course.description ? (
          <small>{course.description}</small>
        ) : null}

        {showPreviewDetails ? (
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

        {!showPreviewDetails ? (
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
    teacherId: row?.tid || null,
    teacherName: row?.teacher?.full_name || "",
    enrolledAt,
    isEnrolled: enrolledAt !== null && enrolledAt !== undefined,
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

function getStudentSearchResults(courses, query, learningStyle) {
  const normalizedQuery = query.trim().toLowerCase();
  const studentStyleKeys = getVarkStyleKeys(learningStyle);

  return [...courses]
    .map((course) => ({
      ...course,
      searchScore: getCourseSearchScore(course, normalizedQuery, studentStyleKeys),
    }))
    .filter((course) => course.searchScore > Number.NEGATIVE_INFINITY)
    .sort((left, right) => {
      if (right.searchScore !== left.searchScore) {
        return right.searchScore - left.searchScore;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 12);
}

function getCourseSearchScore(course, normalizedQuery, studentStyleKeys) {
  const courseName = String(course.name || "").toLowerCase();
  const teacherName = String(course.teacherName || "").toLowerCase();
  const styleMatch = hasMatchingLearningStyle(studentStyleKeys, course.teachingstyle);

  if (!normalizedQuery) {
    return (styleMatch ? 400 : 0) + (course.isEnrolled ? 80 : 0);
  }

  const courseExact = courseName === normalizedQuery;
  const teacherExact = teacherName === normalizedQuery;
  const courseStartsWith = courseName.startsWith(normalizedQuery);
  const teacherStartsWith = teacherName.startsWith(normalizedQuery);
  const courseIncludes = courseName.includes(normalizedQuery);
  const teacherIncludes = teacherName.includes(normalizedQuery);

  if (
    !courseExact &&
    !teacherExact &&
    !courseStartsWith &&
    !teacherStartsWith &&
    !courseIncludes &&
    !teacherIncludes
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (courseExact) {
    score += 1200;
  } else if (courseStartsWith) {
    score += 900;
  } else if (courseIncludes) {
    score += 700;
  }

  if (teacherExact) {
    score += 1100;
  } else if (teacherStartsWith) {
    score += 850;
  } else if (teacherIncludes) {
    score += 650;
  }

  if (styleMatch) {
    score += 300;
  }

  if (course.isEnrolled) {
    score += 120;
  }

  return score;
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

function getNextStudentStreak(profile) {
  const now = new Date();
  const today = getLocalDateKey(now);
  const yesterday = getLocalDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  );
  const lastActiveDate = String(profile?.last_active_date || "").slice(0, 10);
  const currentStreak = Number(profile?.current_streak || 0);
  const longestStreak = Number(profile?.longest_streak || 0);

  let nextStreak = 1;

  if (lastActiveDate === today) {
    nextStreak = Math.max(1, currentStreak);
  } else if (lastActiveDate === yesterday && currentStreak > 0) {
    nextStreak = currentStreak + 1;
  }

  return {
    today,
    currentStreak: nextStreak,
    longestStreak: Math.max(longestStreak, nextStreak),
  };
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStreakDays(currentStreak, referenceDate = new Date()) {
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const todayKey = getLocalDateKey(referenceDate);
  const firstDayOfMonth = new Date(year, month, 1);
  const firstWeekdayOffset =
    firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const streakCount = Math.max(0, Number(currentStreak || 0));
  const activeDayKeys = new Set();

  for (let offset = 0; offset < streakCount; offset += 1) {
    const streakDate = new Date(year, month, referenceDate.getDate() - offset);

    if (
      streakDate.getFullYear() !== year ||
      streakDate.getMonth() !== month
    ) {
      break;
    }

    activeDayKeys.add(getLocalDateKey(streakDate));
  }

  const days = [];

  for (let index = 0; index < firstWeekdayOffset; index += 1) {
    days.push({
      key: `placeholder-${index}`,
      label: "",
      isPlaceholder: true,
      active: false,
      isToday: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = getLocalDateKey(date);

    days.push({
      key: dateKey,
      label: day,
      isPlaceholder: false,
      active: activeDayKeys.has(dateKey),
      isToday: dateKey === todayKey,
    });
  }

  const trailingPlaceholderCount = (7 - (days.length % 7)) % 7;

  for (let index = 0; index < trailingPlaceholderCount; index += 1) {
    days.push({
      key: `trailing-placeholder-${index}`,
      label: "",
      isPlaceholder: true,
      active: false,
      isToday: false,
    });
  }

  return {
    monthLabel: referenceDate.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    weekdays,
    days,
  };
}

function getNextStudyTask(planJson, now = new Date()) {
  if (!Array.isArray(planJson?.days)) {
    return null;
  }

  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset += 1) {
    const dayIndex = (todayIndex + offset) % dayNames.length;
    const dayName = dayNames[dayIndex];
    const dayPlan = planJson.days.find((entry) => entry.day === dayName);
    const sessions = [...(dayPlan?.sessions || [])].sort(
      (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
    );

    if (sessions.length === 0) {
      continue;
    }

    if (offset === 0) {
      const ongoingSession = sessions.find((session) => {
        const start = parseTimeToMinutes(session.startTime);
        const end = parseTimeToMinutes(session.endTime);

        return currentMinutes >= start && currentMinutes < end;
      });

      if (ongoingSession) {
        return {
          ...ongoingSession,
          dayLabel: "Today",
          relativeLabel: "Right now",
          timeLabel: `${ongoingSession.startTime} - ${ongoingSession.endTime}`,
        };
      }

      const upcomingToday = sessions.find(
        (session) => parseTimeToMinutes(session.startTime) > currentMinutes
      );

      if (upcomingToday) {
        return {
          ...upcomingToday,
          dayLabel: "Today",
          relativeLabel: "Later today",
          timeLabel: `${upcomingToday.startTime} - ${upcomingToday.endTime}`,
        };
      }

      continue;
    }

    const nextSession = sessions[0];

    return {
      ...nextSession,
      dayLabel: offset === 1 ? "Tomorrow" : dayName,
      relativeLabel:
        offset === 1
          ? "Coming up tomorrow"
          : dayIndex > todayIndex || offset < 7 - todayIndex
            ? dayName
            : `Next ${dayName}`,
      timeLabel: `${nextSession.startTime} - ${nextSession.endTime}`,
    };
  }

  return null;
}

function parseTimeToMinutes(value) {
  if (!value) {
    return 0;
  }

  const [hours = "0", minutes = "0"] = String(value).split(":");

  return Number(hours) * 60 + Number(minutes);
}

function formatActivityType(value) {
  if (!value) {
    return "Study session";
  }

  return String(value)
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
