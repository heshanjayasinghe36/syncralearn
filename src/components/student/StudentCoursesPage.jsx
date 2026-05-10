import { BookOpen } from "lucide-react";
import "./StudentCoursesPage.css";

export default function StudentCoursesPage({
  courses,
  loading,
  message,
  onOpenCourse,
  onAddReview,
}) {
  return (
    <section className="student-settings-page student-courses-page" aria-label="Student courses">
      <div className="student-settings-header">
        <span>
          <BookOpen aria-hidden="true" />
          Courses
        </span>
        {/* <h2>My Courses</h2> */}
      </div>

      {loading ? (
        <p className="student-suggestion-state student-courses-state">
          Loading enrolled courses...
        </p>
      ) : message ? (
        <p className="student-suggestion-state student-courses-state">{message}</p>
      ) : (
        <div className="student-courses-grid">
          {courses.map((course) => (
            <StudentEnrolledCourseCard
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

function StudentEnrolledCourseCard({ course, onOpenCourse, onAddReview }) {
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
      </div>
    </article>
  );
}
