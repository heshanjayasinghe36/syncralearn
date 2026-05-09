import CoursePreviewPage from "../teacher/CoursePreviewPage";

export default function StudentCourseLearningPage({
  course,
  displayName,
  onBack,
  studentId,
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
    />
  );
}
