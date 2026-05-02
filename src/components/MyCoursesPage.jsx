import { useEffect, useState } from "react";
import {
  Calendar,
  ChevronDown,
  CirclePlus,
  FileText,
  HelpCircle,
  MoreVertical,
  Users,
  X,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../lib/supabase";

const COURSE_IMAGES_BUCKET = "course_img";

const courseLevels = [
  {
    value: "beginner",
    label: "Beginner",
    badge: "BG",
    description: "Introductory course for new learners.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    badge: "IM",
    description: "For learners with some foundation knowledge.",
  },
  {
    value: "advanced",
    label: "Advanced",
    badge: "AD",
    description: "Deep or specialized course material.",
  },
];

export default function MyCoursesPage({
  teacherProfile,
  modalOpen,
  onModalOpenChange,
}) {
  const [courses, setCourses] = useState([]);
  const [courseName, setCourseName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("beginner");
  const [imageFile, setImageFile] = useState(null);
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadCourses() {
      if (!teacherProfile?.tid || !supabase) {
        setCourses([]);
        return;
      }

      setLoadingCourses(true);
      setMessage("");

      const { data, error } = await supabase
        .from("course")
        .select("cid, name, description, level, status, img_url")
        .eq("tid", teacherProfile.tid)
        .order("cid", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        setMessage(`Courses load failed: ${error.message}`);
        setCourses([]);
      } else {
        setCourses((data || []).map(mapCourseRowToCard));
      }

      setLoadingCourses(false);
    }

    loadCourses();

    return () => {
      ignore = true;
    };
  }, [teacherProfile?.tid]);

  function resetForm() {
    setCourseName("");
    setDescription("");
    setLevel("beginner");
    setImageFile(null);
    setLevelMenuOpen(false);
    setMessage("");
  }

  function closeModal() {
    if (saving) {
      return;
    }

    onModalOpenChange(false);
    resetForm();
  }

  async function handleCreateCourse(event) {
    event.preventDefault();

    const name = courseName.trim();
    const cleanDescription = description.trim();
    setLevelMenuOpen(false);

    if (!name) {
      setMessage("Course name is required.");
      return;
    }

    if (!teacherProfile?.tid) {
      setMessage("Teacher profile ID was not found.");
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    setSaving(true);
    setMessage("");

    let imageUrl = null;

    if (imageFile) {
      const safeFileName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${teacherProfile.tid}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(COURSE_IMAGES_BUCKET)
        .upload(filePath, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(`Image upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from(COURSE_IMAGES_BUCKET)
        .getPublicUrl(filePath);

      imageUrl = publicData.publicUrl || null;
    }

    const { data, error } = await supabase
      .from("course")
      .insert({
        name,
        description: cleanDescription || null,
        level,
        img_url: imageUrl,
        tid: teacherProfile.tid,
        status: "draft",
      })
      .select("cid, name, description, level, status, img_url")
      .single();

    if (error) {
      setMessage(`Course creation failed: ${error.message}`);
      setSaving(false);
      return;
    }

    setCourses((currentCourses) => [
      mapCourseRowToCard({
        cid: data?.cid || name,
        name: data?.name || name,
        level: data?.level || level,
        status: data?.status || "draft",
        img_url: data?.img_url || imageUrl,
      }),
      ...currentCourses,
    ]);
    setSaving(false);
    onModalOpenChange(false);
    resetForm();
  }

  return (
    <main className="teacher-courses-page" aria-label="My courses">
      <div className="teacher-courses-header">
        <div>
          <h2>My Courses</h2>
          <p>
            Manage your educational content, monitor student progress, and
            organize your upcoming courses.
          </p>
        </div>

        <button
          type="button"
          className="teacher-new-course-button"
          onClick={() => onModalOpenChange(true)}
        >
          <CirclePlus aria-hidden="true" />
          <span>Create New Course</span>
        </button>
      </div>

      <div className="teacher-courses-toolbar">
        <div className="teacher-course-tabs" aria-label="Course filters">
          <button type="button" className="is-active">
            Active
          </button>
          <button type="button">Draft</button>
          <button type="button">Hold</button>
        </div>

        <div className="teacher-course-stats">
          <span>
            <i aria-hidden="true" />
            {courses.filter((course) => course.rawStatus === "active").length} Active Courses
          </span>
          <span className="purple">
            <i aria-hidden="true" />
            {courses.reduce((total, course) => total + course.studentCount, 0)} Students Total
          </span>
        </div>
      </div>

      <section className="teacher-course-grid" aria-label="Course list">
        {loadingCourses ? (
          <p className="teacher-course-empty">Loading your courses...</p>
        ) : courses.length > 0 ? (
          courses.map((course) => <CourseCard key={course.id} course={course} />)
        ) : (
          <p className="teacher-course-empty">
            No courses yet. Create a course to see it here.
          </p>
        )}
      </section>

      <footer className="teacher-courses-footer">
        <span>
          <HelpCircle aria-hidden="true" />
          Help Center
        </span>
        <span>
          <FileText aria-hidden="true" />
          Course Guidelines
        </span>
        <span>
          {"\u00A9"} 2026 Syncra Learn. All pedagogical content is
          teacher-owned.
        </span>
      </footer>

      {modalOpen ? (
        <div className="teacher-course-modal-backdrop" role="presentation">
          <form
            className="teacher-course-modal"
            onSubmit={handleCreateCourse}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-course-title"
          >
            <div className="teacher-course-modal-header">
              <div>
                <p>Create course</p>
                <h3 id="create-course-title">New Course</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close create course dialog"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <label className="teacher-course-form-field">
              <span>Course name</span>
              <input
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                type="text"
                placeholder="e.g. Introduction to AI"
                disabled={saving}
                autoFocus
              />
            </label>

            <label className="teacher-course-form-field">
              <span>Description <small>Optional</small></span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short course summary"
                disabled={saving}
                rows={3}
              />
            </label>

            <label className="teacher-course-form-field">
              <span>Course image <small>Optional</small></span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={saving}
                className="teacher-course-file-input"
                onChange={(event) => {
                  setImageFile(event.target.files?.[0] || null);
                }}
              />
              {imageFile ? (
                <p className="teacher-course-file-name">
                  Selected image: {imageFile.name}
                </p>
              ) : null}
            </label>

            <label className="teacher-course-form-field">
              <span>Level</span>
              <LevelDropdown
                value={level}
                onChange={setLevel}
                disabled={saving}
                open={levelMenuOpen}
                onOpenChange={setLevelMenuOpen}
              />
            </label>

            {message ? (
              <p className="teacher-course-modal-message">{message}</p>
            ) : null}

            <div className="teacher-course-modal-actions">
              <button type="button" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Course"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function CourseCard({ course }) {
  return (
    <article className={`teacher-course-card ${course.tone}`}>
      <div
        className={`teacher-course-visual ${course.imgUrl ? "has-image" : ""}`}
      >
        {course.imgUrl ? (
          <img src={course.imgUrl} alt={`${course.title} cover`} />
        ) : null}
        <span>{course.tag}</span>
      </div>

      <div className="teacher-course-body">
        <div className="teacher-course-title-row">
          <h3>{course.title}</h3>
          <button type="button" aria-label={`${course.title} options`}>
            <MoreVertical aria-hidden="true" />
          </button>
        </div>

        <div className="teacher-course-meta">
          <span>
            <Users aria-hidden="true" />
            {course.students} Students
          </span>
          <span>
            <Calendar aria-hidden="true" />
            {course.schedule}
          </span>
        </div>

        <div className="teacher-course-progress-label">
          <span>Student Course Completion</span>
          <strong>{course.progress}%</strong>
        </div>
        <div className="teacher-course-progress">
          <span style={{ width: `${course.progress}%` }} />
        </div>
      </div>
    </article>
  );
}

function LevelDropdown({ value, onChange, disabled, open, onOpenChange }) {
  const selectedLevel =
    courseLevels.find((courseLevel) => courseLevel.value === value) ||
    courseLevels[0];

  return (
    <div className="teacher-level-select">
      <button
        type="button"
        className="student-select-trigger"
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{selectedLevel.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="student-select-menu teacher-level-menu top-full mt-2">
          <div className="space-y-1" role="listbox">
            <p className="student-select-group">Course level</p>
            {courseLevels.map((courseLevel) => {
              const isSelected = courseLevel.value === value;

              return (
                <button
                  key={courseLevel.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(courseLevel.value);
                    onOpenChange(false);
                  }}
                  className={`student-select-option teacher-level-option ${
                    isSelected ? "is-selected" : ""
                  }`}
                >
                  <span className="student-select-badge">
                    {courseLevel.badge}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {courseLevel.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getLevelLabel(value) {
  return (
    courseLevels.find((courseLevel) => courseLevel.value === value)?.label ||
    "Beginner"
  );
}

function getLevelTone(value) {
  if (value === "advanced") {
    return "green";
  }

  if (value === "intermediate") {
    return "purple";
  }

  return "warm";
}

function mapCourseRowToCard(row) {
  const levelValue = row?.level || "beginner";
  const statusValue = row?.status || "draft";

  return {
    id: row?.cid || row?.name,
    title: row?.name || "Untitled Course",
    tag: getLevelLabel(levelValue),
    students: "0",
    studentCount: 0,
    schedule: formatCourseStatus(statusValue),
    rawStatus: statusValue,
    progress: 0,
    tone: getLevelTone(levelValue),
    imgUrl: row?.img_url || null,
  };
}

function formatCourseStatus(value) {
  if (!value) {
    return "Draft";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
