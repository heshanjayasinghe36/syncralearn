import CoursePreviewPage from "../teacher/CoursePreviewPage";

export default function StudentCourseLearningPage({
  course,
  displayName,
  onBack,
  studentId,
  initialLessonId,
  onLessonSelect,
}) {
  return (
    <CoursePreviewPage
      course={course}
      displayName={displayName}
      onBack={onBack}
      previewLabel=""
      pageLabel="Student course learning"
      backLabel="Back to courses"
      enableVideoTracking
      studentId={studentId}
      initialLessonId={initialLessonId}
      onLessonSelect={onLessonSelect}
    />
  );
}
