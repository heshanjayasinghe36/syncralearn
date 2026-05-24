import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  GitBranch,
  GraduationCap,
  Mail,
  ShieldCheck,
  Star,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import { getVarkResultLabel } from "../../lib/vark";

const TEACHER_SELECT_COLUMNS =
  "tid, full_name, email, mts, about, academic_qualification, field_of_study, institution_name, linkedin_url, github_url, verification_status, verified_at";

const TEACHER_SELECT_COLUMNS_FALLBACK =
  "tid, full_name, email, mts, academic_qualification, field_of_study, institution_name, linkedin_url, github_url, verification_status, verified_at";

export default function TeacherProfilePage({
  teacherId,
  initialTeacherName = "",
  enrolledCourses = [],
  onBack,
  onOpenCourse,
}) {
  const [teacher, setTeacher] = useState(null);
  const [courses, setCourses] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState("profile");

  useEffect(() => {
    let ignore = false;

    async function loadTeacherProfile() {
      if (!supabase) {
        setMessage(supabaseConfigError || "Supabase is not configured.");
        return;
      }

      if (!teacherId) {
        setMessage("Teacher profile was not found.");
        return;
      }

      setLoading(true);
      setMessage("");

      let { data: teacherData, error: teacherError } = await supabase
        .from("teacher")
        .select(TEACHER_SELECT_COLUMNS)
        .eq("tid", teacherId)
        .maybeSingle();

      if (teacherError && teacherError.message?.includes("about")) {
        const fallbackResult = await supabase
          .from("teacher")
          .select(TEACHER_SELECT_COLUMNS_FALLBACK)
          .eq("tid", teacherId)
          .maybeSingle();

        teacherData = fallbackResult.data;
        teacherError = fallbackResult.error;
      }

      const { data: courseData, error: courseError } = await supabase
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
          review (
            rid,
            rating,
            comment,
            date,
            time
          )
        `
        )
        .eq("tid", teacherId)
        .ilike("status", "active")
        .order("cid", { ascending: false });

      if (ignore) {
        return;
      }

      if (teacherError) {
        setTeacher(null);
        setCourses([]);
        setMessage(`Teacher profile load failed: ${teacherError.message}`);
        setLoading(false);
        return;
      }

      if (courseError) {
        setTeacher(teacherData || null);
        setCourses([]);
        setMessage(`Teacher courses load failed: ${courseError.message}`);
        setLoading(false);
        return;
      }

      const mappedCourses = (courseData || []).map((course) =>
        mapTeacherCourse(course, teacherData)
      );
      const courseIds = mappedCourses.map((course) => course.id).filter(Boolean);
      let enrolledStudentCount = 0;

      if (courseIds.length > 0) {
        const { count, error: countError } = await supabase
          .from("student_course")
          .select("sid", { count: "exact", head: true })
          .in("cid", courseIds);

        if (!countError) {
          enrolledStudentCount = count || 0;
        }
      }

      if (ignore) {
        return;
      }

      setTeacher(teacherData || null);
      setCourses(mappedCourses);
      setTotalStudents(enrolledStudentCount);
      setMessage("");
      setLoading(false);
    }

    void loadTeacherProfile();

    return () => {
      ignore = true;
    };
  }, [teacherId]);

  useEffect(() => {
    setViewMode("profile");
  }, [teacherId]);

  const stats = useMemo(() => buildTeacherStats(courses), [courses]);
  const profileName = teacher?.full_name || initialTeacherName || "Teacher";
  const initials = getInitials(profileName);
  const aboutText =
    teacher?.about?.trim() ||
    "This teacher has not added an about section yet.";
  const roleLine =
    teacher?.field_of_study || teacher?.academic_qualification || "Syncra Learn Teacher";
  const enrolledCourseById = useMemo(() => {
    const courseMap = new Map();

    for (const course of enrolledCourses || []) {
      const courseId = Number(course?.id ?? course?.cid);

      if (Number.isFinite(courseId)) {
        courseMap.set(courseId, course);
      }
    }

    return courseMap;
  }, [enrolledCourses]);
  const coursesWithEnrollment = useMemo(
    () =>
      courses.map((course) => {
        const enrolledCourse = enrolledCourseById.get(Number(course.id));

        if (!enrolledCourse) {
          return {
            ...course,
            isEnrolled: false,
            progressPercent: 0,
            completed: false,
          };
        }

        return {
          ...course,
          enrolledAt: enrolledCourse.enrolledAt ?? null,
          isEnrolled: true,
          progressPercent: enrolledCourse.progressPercent ?? 0,
          completed: enrolledCourse.completed || false,
        };
      }),
    [courses, enrolledCourseById]
  );
  const availableCourses = coursesWithEnrollment.filter(
    (course) => !course.isEnrolled
  );
  const enrolledTeacherCourses = coursesWithEnrollment.filter(
    (course) => course.isEnrolled
  );
  const popularCourses = [...courses]
    .sort((left, right) => {
      if (right.ratingCount !== left.ratingCount) {
        return right.ratingCount - left.ratingCount;
      }

      return right.averageRating - left.averageRating;
    })
    .slice(0, 2);
  const testimonials = courses
    .flatMap((course) =>
      course.reviews
        .filter((review) => review.comment)
        .map((review) => ({
          ...review,
          courseName: course.name,
        }))
    )
    .sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0))
    .slice(0, 3);

  if (loading) {
    return (
      <section className="student-teacher-profile-page">
        <button type="button" className="student-preview-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </button>
        <p className="student-suggestion-state">Loading teacher profile...</p>
      </section>
    );
  }

  if (message) {
    return (
      <section className="student-teacher-profile-page">
        <button type="button" className="student-preview-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </button>
        <p className="student-suggestion-state">{message}</p>
      </section>
    );
  }

  if (viewMode === "courses") {
    return (
      <section
        className="student-teacher-profile-page"
        aria-label={`${profileName} courses`}
      >
        <button
          type="button"
          className="student-preview-back"
          onClick={() => setViewMode("profile")}
        >
          <ArrowLeft aria-hidden="true" />
          Back to profile
        </button>

        <section className="student-teacher-all-courses">
          <div className="student-teacher-section-head">
            <div>
              <h3>{profileName}'s Courses</h3>
              <p>
                {availableCourses.length} not enrolled,{" "}
                {enrolledTeacherCourses.length} enrolled
              </p>
            </div>
          </div>

          {courses.length > 0 ? (
            <div className="student-teacher-course-library">
              <TeacherCourseGroup
                badge="Available"
                title="Courses You Can Enroll"
                description="These courses are active and not in your learning list yet."
                courses={availableCourses}
                emptyMessage="No new courses from this teacher right now."
                forcePreviewDetails
                onOpenCourse={onOpenCourse}
              />

              <TeacherCourseGroup
                badge="Your learning"
                title="Already Enrolled"
                description="Courses from this teacher that you have already joined."
                courses={enrolledTeacherCourses}
                emptyMessage="You have not enrolled in this teacher's courses yet."
                onOpenCourse={onOpenCourse}
              />
            </div>
          ) : (
            <p className="student-teacher-empty">No active courses yet.</p>
          )}
        </section>
      </section>
    );
  }

  return (
    <section
      className="student-teacher-profile-page"
      aria-label={`${profileName} teacher profile`}
    >
      <button type="button" className="student-preview-back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back
      </button>

      <section className="student-teacher-hero">
        <div className="student-teacher-avatar-wrap">
          <div className="student-teacher-avatar">{initials}</div>
          {isVerifiedTeacher(teacher) ? (
            <span className="student-teacher-verified" title="Verified teacher">
              <ShieldCheck aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <div className="student-teacher-hero-main">
          <div>
            <h2>{profileName}</h2>
            <p>{roleLine}</p>
          </div>

          <div className="student-teacher-stats" aria-label="Teacher stats">
            <StatBlock
              value={stats.ratingLabel}
              label="Instructor Rating"
            />
            <StatBlock value={formatCompactNumber(totalStudents)} label="Total Students" />
            <StatBlock value={courses.length} label="Active Courses" />
          </div>

          <div className="student-teacher-actions">
            {teacher?.email ? (
              <a href={`mailto:${teacher.email}`} className="student-teacher-primary-link">
                <Mail aria-hidden="true" />
                Contact
              </a>
            ) : null}

            {teacher?.linkedin_url ? (
              <a
                href={teacher.linkedin_url}
                target="_blank"
                rel="noreferrer"
            className="student-teacher-soft-link"
              >
                <ExternalLink aria-hidden="true" />
                LinkedIn
              </a>
            ) : null}
          </div>
        </div>

      </section>

      <div className="student-teacher-profile-grid">
        <aside className="student-teacher-sidebar">
          <section className="student-teacher-card student-teacher-about">
            <h3>About Me</h3>
            <p>{aboutText}</p>
          </section>

          <section className="student-teacher-card student-teacher-education">
            <h3>Experience & Education</h3>
            <ProfileFact
              icon={<GraduationCap aria-hidden="true" />}
              label={teacher?.academic_qualification || "Qualification not provided"}
              value={teacher?.institution_name || "Institution not provided"}
            />
            <ProfileFact
              icon={<BriefcaseBusiness aria-hidden="true" />}
              label={teacher?.field_of_study || "Field not provided"}
              value={formatTeachingStyle(teacher?.mts)}
            />
            <ProfileFact
              icon={<Award aria-hidden="true" />}
              label={isVerifiedTeacher(teacher) ? "Verified teacher" : "Verification pending"}
              value={formatVerifiedDate(teacher?.verified_at)}
            />
          </section>

          <section className="student-teacher-card student-teacher-socials">
            {teacher?.github_url ? (
              <a href={teacher.github_url} target="_blank" rel="noreferrer">
                <GitBranch aria-hidden="true" />
                GitHub
              </a>
            ) : null}
            {teacher?.linkedin_url ? (
              <a href={teacher.linkedin_url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                LinkedIn
              </a>
            ) : null}
            {teacher?.email ? (
              <a href={`mailto:${teacher.email}`}>
                <Mail aria-hidden="true" />
                Email
              </a>
            ) : null}
          </section>
        </aside>

        <div className="student-teacher-main">
          <section className="student-teacher-card student-teacher-courses">
            <div className="student-teacher-section-head">
              <h3>Popular Courses</h3>
              {courses.length > 0 ? (
                <button
                  type="button"
                  className="student-teacher-see-all"
                  aria-label={`See all courses by ${profileName}`}
                  onClick={() => setViewMode("courses")}
                >
                  See all courses
                  <ArrowRight aria-hidden="true" />
                </button>
              ) : (
                <span>No active courses</span>
              )}
            </div>

            {popularCourses.length > 0 ? (
              <div className="student-teacher-course-grid">
                {popularCourses.map((course) => (
                  <TeacherCourseCard
                    key={course.id}
                    course={course}
                    onOpenCourse={onOpenCourse}
                  />
                ))}
              </div>
            ) : (
              <p className="student-teacher-empty">No active courses yet.</p>
            )}
          </section>

          <section className="student-teacher-card student-teacher-testimonials">
            <h3>Student Testimonials</h3>

            {testimonials.length > 0 ? (
              <div className="student-teacher-testimonial-list">
                {testimonials.map((review, index) => (
                  <article
                    key={review.rid || `${review.courseName}-${index}`}
                    className="student-teacher-testimonial"
                  >
                    <div>
                      <span>{getInitials(review.courseName)}</span>
                      <div>
                        <strong>{review.courseName}</strong>
                        <small>{formatReviewDate(review.date)}</small>
                      </div>
                    </div>
                    <div className="student-teacher-stars" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star
                          key={starIndex}
                          className={starIndex < Number(review.rating || 0) ? "active" : ""}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <p>"{review.comment}"</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="student-teacher-empty">No student testimonials yet.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function StatBlock({ value, label }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProfileFact({ icon, label, value }) {
  return (
    <div className="student-teacher-fact">
      <span>{icon}</span>
      <div>
        <strong>{label}</strong>
        <p>{value}</p>
      </div>
    </div>
  );
}

function TeacherCourseCard({ course, onOpenCourse }) {
  return (
    <button
      type="button"
      className="student-teacher-course-card"
      onClick={() => onOpenCourse?.(course)}
    >
      <div className="student-teacher-course-cover">
        {course.imgUrl ? (
          <img src={course.imgUrl} alt="" />
        ) : (
          <BookOpen aria-hidden="true" />
        )}
        <span>{course.levelLabel}</span>
      </div>
      <div>
        <h4>{course.name}</h4>
        <p>
          <Star aria-hidden="true" />
          {course.ratingCount > 0
            ? `${course.averageRating.toFixed(1)} (${course.ratingCount})`
            : "No ratings"}
        </p>
        {course.description ? <small>{course.description}</small> : null}
      </div>
    </button>
  );
}

function TeacherCourseGroup({
  badge,
  title,
  description,
  courses,
  emptyMessage,
  forcePreviewDetails = false,
  onOpenCourse,
}) {
  return (
    <section className="student-suggestions-section student-teacher-course-section">
      <div className="student-suggestions-header">
        <div>
          <div className="student-suggestions-header-top">
            <span>
              <BookOpen aria-hidden="true" />
              {badge}
            </span>
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      {courses.length > 0 ? (
        <div className="student-suggestion-grid student-teacher-dashboard-course-grid">
          {courses.map((course) => (
            <TeacherDashboardCourseCard
              key={course.id}
              course={course}
              forcePreviewDetails={forcePreviewDetails}
              onOpenCourse={onOpenCourse}
            />
          ))}
        </div>
      ) : (
        <p className="student-suggestion-state">{emptyMessage}</p>
      )}
    </section>
  );
}

function TeacherDashboardCourseCard({
  course,
  forcePreviewDetails = false,
  onOpenCourse,
}) {
  const showPreviewDetails = forcePreviewDetails || !course.isEnrolled;

  function openCourse() {
    onOpenCourse?.(course);
  }

  return (
    <article
      className="student-course-card"
      tabIndex={0}
      role="button"
      onClick={openCourse}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCourse();
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
          <span className="student-course-teacher">
            {course.teacherName || "Unknown teacher"}
          </span>
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

function mapTeacherCourse(row, teacher) {
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
    styleLabel: formatCourseStyle(row?.teachingstyle),
    amount: row?.amount,
    level: row?.level || "",
    levelLabel: formatCourseLevel(row?.level),
    status: row?.status || "",
    imgUrl: row?.img_url || "",
    introVideoUrl: row?.intro_vid_url || "",
    intro_vid_url: row?.intro_vid_url || "",
    teacherId: row?.tid || teacher?.tid || null,
    teacherName: teacher?.full_name || "",
    averageRating,
    ratingCount,
    reviews,
  };
}

function buildTeacherStats(courses) {
  const reviews = courses.flatMap((course) => course.reviews || []);
  const ratings = reviews
    .map((review) => Number(review.rating))
    .filter((rating) => Number.isFinite(rating));
  const averageRating =
    ratings.length > 0
      ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
      : 0;

  return {
    ratingLabel: ratings.length > 0 ? averageRating.toFixed(1) : "New",
  };
}

function isVerifiedTeacher(teacher) {
  return (
    String(teacher?.verification_status || "").toLowerCase() === "verified" ||
    Boolean(teacher?.verified_at)
  );
}

function formatTeachingStyle(value) {
  return value ? `${getVarkResultLabel(value)} teaching style` : "Teaching style not set";
}

function formatCourseStyle(value) {
  return value ? getVarkResultLabel(value) : "Course";
}

function formatCourseLevel(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "All Levels";
  }

  return normalizedValue
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function formatCompactNumber(value) {
  const numericValue = Number(value || 0);

  if (numericValue >= 1000) {
    return `${(numericValue / 1000).toFixed(numericValue >= 10000 ? 0 : 1)}k`;
  }

  return String(numericValue);
}

function formatVerifiedDate(value) {
  if (!value) {
    return "Verification not completed";
  }

  return `Verified ${new Date(value).getFullYear()}`;
}

function formatReviewDate(value) {
  if (!value) {
    return "Recent review";
  }

  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name) {
  const initials = String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "T";
}
