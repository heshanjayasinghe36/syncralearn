import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Calendar,
  ChevronDown,
  CirclePlus,
  FileText,
  HelpCircle,
  MoreVertical,
  Users,
  X,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";

const COURSE_IMAGES_BUCKET = "course_img";
const COURSE_SELECT_COLUMNS =
  "cid, name, description, level, status, img_url, amount, intro_vid_url";
const COURSE_SELECT_COLUMNS_FALLBACK =
  "cid, name, description, level, status, img_url, amount";

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

const courseStatuses = [
  { value: "active", label: "Activate" },
  { value: "hold", label: "Hold" },
  { value: "draft", label: "Set as draft" },
];

const courseTabs = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "hold", label: "Hold" },
];

export default function MyCoursesPage({
  teacherProfile,
  modalOpen,
  onModalOpenChange,
  onCourseCreated,
  onEditLessons,
  onPreviewCourse,
}) {
  const [courses, setCourses] = useState([]);
  const [courseName, setCourseName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("beginner");
  const [imageFile, setImageFile] = useState(null);
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const [activeCourseMenuId, setActiveCourseMenuId] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeCourseTab, setActiveCourseTab] = useState("all");
  const isEditingCourse = Boolean(editingCourse);

  const filteredCourses = useMemo(() => {
    if (activeCourseTab === "all") {
      return courses;
    }

    return courses.filter((course) => course.rawStatus === activeCourseTab);
  }, [activeCourseTab, courses]);

  useEffect(() => {
    let ignore = false;

    async function loadCourses() {
      if (!teacherProfile?.tid || !supabase) {
        setCourses([]);
        return;
      }

      setLoadingCourses(true);
      setMessage("");

      let { data, error } = await supabase
        .from("course")
        .select(COURSE_SELECT_COLUMNS)
        .eq("tid", teacherProfile.tid)
        .order("cid", { ascending: false });

      if (error && error.message?.includes("intro_vid_url")) {
        const fallbackResult = await supabase
          .from("course")
          .select(COURSE_SELECT_COLUMNS_FALLBACK)
          .eq("tid", teacherProfile.tid)
          .order("cid", { ascending: false });

        data = fallbackResult.data;
        error = fallbackResult.error;

        if (!error) {
          setMessage(
            "Courses loaded, but intro_vid_url was not found in the course table."
          );
        }
      }

      if (ignore) {
        return;
      }

      if (error) {
        setMessage(`Courses load failed: ${error.message}`);
        setCourses([]);
      } else {
        const mappedCourses = await hydrateCourseEnrollmentProgress(
          (data || []).map(mapCourseRowToCard)
        );

        if (ignore) {
          return;
        }

        setCourses(mappedCourses);
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
    setEditingCourse(null);
    setMessage("");
  }

  function openCreateCourseModal() {
    resetForm();
    setActiveCourseMenuId(null);
    onModalOpenChange(true);
  }

  function openEditCourseModal(course) {
    setEditingCourse(course);
    setCourseName(course.title || "");
    setDescription(course.description || "");
    setLevel(course.level || "beginner");
    setImageFile(null);
    setLevelMenuOpen(false);
    setActiveCourseMenuId(null);
    setMessage("");
    onModalOpenChange(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    onModalOpenChange(false);
    resetForm();
  }

  async function handleSaveCourse(event) {
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

    let imageUrl = editingCourse?.imgUrl || null;

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

    if (isEditingCourse) {
      if (!editingCourse?.cid) {
        setMessage("Course ID was not found.");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase
        .from("course")
        .update({
          name,
          description: cleanDescription || null,
          level,
          img_url: imageUrl,
        })
        .eq("cid", editingCourse.cid)
        .eq("tid", teacherProfile.tid)
        .select(COURSE_SELECT_COLUMNS)
        .single();

      if (error) {
        setMessage(`Course update failed: ${error.message}`);
        setSaving(false);
        return;
      }

      const [updatedCourse] = await hydrateCourseEnrollmentProgress([
        mapCourseRowToCard(data),
      ]);
      setCourses((currentCourses) =>
        currentCourses.map((course) =>
          course.id === updatedCourse.id ? updatedCourse : course
        )
      );
      setSaving(false);
      onModalOpenChange(false);
      resetForm();
      return;
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
      .select(COURSE_SELECT_COLUMNS)
      .single();

    if (error) {
      setMessage(`Course creation failed: ${error.message}`);
      setSaving(false);
      return;
    }

    const createdCourse = mapCourseRowToCard({
      cid: data?.cid || name,
      name: data?.name || name,
      description: data?.description || cleanDescription,
      amount: data?.amount ?? "",
      level: data?.level || level,
      status: data?.status || "draft",
      img_url: data?.img_url || imageUrl,
      intro_vid_url: data?.intro_vid_url || null,
    });

    setCourses((currentCourses) => [createdCourse, ...currentCourses]);
    setSaving(false);
    onModalOpenChange(false);
    resetForm();
    onCourseCreated?.(createdCourse);
  }

  async function handleDeleteCourse(course) {
    setActiveCourseMenuId(null);

    if (!course?.cid) {
      setMessage("Course ID was not found.");
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${course.title}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("course")
      .delete()
      .eq("cid", course.cid)
      .eq("tid", teacherProfile.tid);

    if (error) {
      setMessage(`Course delete failed: ${error.message}`);
      return;
    }

    setCourses((currentCourses) =>
      currentCourses.filter((currentCourse) => currentCourse.id !== course.id)
    );
  }

  function handleEditLessons(course) {
    setActiveCourseMenuId(null);
    onEditLessons?.(course);
  }

  async function handleChangeCourseStatus(course, nextStatus) {
    setActiveCourseMenuId(null);

    if (!course?.cid || course.rawStatus === nextStatus) {
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

      const { data, error } = await supabase
        .from("course")
        .update({ status: nextStatus })
        .eq("cid", course.cid)
        .eq("tid", teacherProfile.tid)
      .select(COURSE_SELECT_COLUMNS)
      .single();

    if (error) {
      setMessage(`Status update failed: ${error.message}`);
      return;
    }

    const [updatedCourse] = await hydrateCourseEnrollmentProgress([
      mapCourseRowToCard(data),
    ]);
    setCourses((currentCourses) =>
      currentCourses.map((currentCourse) =>
        currentCourse.id === updatedCourse.id ? updatedCourse : currentCourse
      )
    );
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
          onClick={openCreateCourseModal}
        >
          <CirclePlus aria-hidden="true" />
          <span>Create New Course</span>
        </button>
      </div>

      <div className="teacher-courses-toolbar">
        <div className="teacher-course-tabs" aria-label="Course filters">
          {courseTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={activeCourseTab === tab.value ? "is-active" : ""}
              onClick={() => setActiveCourseTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="teacher-course-stats">
          <span>
            <i aria-hidden="true" />
            {courses.filter((course) => course.rawStatus === "active").length}{" "}
            Active Courses
          </span>
          <span className="purple">
            <i aria-hidden="true" />
            {courses.reduce((total, course) => total + course.studentCount, 0)} Students Total
          </span>
        </div>
      </div>

      {message ? <p className="teacher-course-page-message">{message}</p> : null}

      <section className="teacher-course-grid" aria-label="Course list">
        {loadingCourses ? (
          <p className="teacher-course-empty">Loading your courses...</p>
        ) : filteredCourses.length > 0 ? (
          filteredCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              menuOpen={activeCourseMenuId === course.id}
              onToggleMenu={() =>
                setActiveCourseMenuId((currentMenuId) =>
                  currentMenuId === course.id ? null : course.id
                )
              }
              onEdit={() => openEditCourseModal(course)}
              onEditLessons={() => handleEditLessons(course)}
              onDelete={() => void handleDeleteCourse(course)}
              onChangeStatus={(nextStatus) =>
                void handleChangeCourseStatus(course, nextStatus)
              }
              onPreview={() => onPreviewCourse?.(course)}
            />
          ))
        ) : (
          <p className="teacher-course-empty">
            {activeCourseTab === "all"
              ? "No courses yet. Create a course to see it here."
              : `No ${activeCourseTab} courses found.`}
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
            onSubmit={handleSaveCourse}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-course-title"
          >
            <div className="teacher-course-modal-header">
              <div>
                <p>{isEditingCourse ? "Edit course" : "Create course"}</p>
                <h3 id="create-course-title">
                  {isEditingCourse ? "Update Course" : "New Course"}
                </h3>
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
              ) : isEditingCourse && editingCourse?.imgUrl ? (
                <p className="teacher-course-file-name">
                  Current cover image will stay unless you choose a new one.
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
                {saving
                  ? isEditingCourse
                    ? "Updating..."
                    : "Creating..."
                  : isEditingCourse
                    ? "Update Course"
                    : "Create Course"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function CourseCard({
  course,
  menuOpen,
  onToggleMenu,
  onEdit,
  onEditLessons,
  onDelete,
  onChangeStatus,
  onPreview,
}) {
  function handleCardKeyDown(event) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onEditLessons?.();
  }

  return (
    <article
      className={`teacher-course-card ${course.tone}`}
      role="button"
      tabIndex={0}
      onClick={onEditLessons}
      onKeyDown={handleCardKeyDown}
      aria-label={`Edit lessons for ${course.title}`}
    >
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
          <div className="teacher-course-menu-wrap">
            <button
              type="button"
              aria-label={`${course.title} options`}
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMenu();
              }}
            >
              <MoreVertical aria-hidden="true" />
            </button>

            {menuOpen ? (
              <div
                className="teacher-course-action-menu"
                onClick={(event) => event.stopPropagation()}
                role="presentation"
              >
                <button type="button" onClick={onEdit}>
                  Edit
                </button>
                <button type="button" onClick={onPreview}>
                  Student Preview
                </button>
                <button type="button" className="danger" onClick={onDelete}>
                  Delete
                </button>
                <div className="teacher-course-action-divider" />
                {courseStatuses.map((status) => {
                  const isCurrentStatus = course.rawStatus === status.value;

                  return (
                    <button
                      key={status.value}
                      type="button"
                      disabled={isCurrentStatus}
                      onClick={() => onChangeStatus(status.value)}
                    >
                      {status.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
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
          <span className="teacher-course-amount">
            <Banknote aria-hidden="true" />
            {formatCourseAmount(course.amount)}
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
        <div className="student-select-menu teacher-level-menu">
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
    cid: row?.cid || null,
    id: row?.cid || row?.name,
    title: row?.name || "Untitled Course",
    description: row?.description || "",
    amount: row?.amount ?? "",
    level: levelValue,
    tag: getLevelLabel(levelValue),
    students: "0",
    studentCount: 0,
    schedule: formatCourseStatus(statusValue),
    rawStatus: statusValue,
    progress: 0,
    tone: getLevelTone(levelValue),
    imgUrl: row?.img_url || null,
    introVideoUrl: row?.intro_vid_url || null,
    intro_vid_url: row?.intro_vid_url || null,
  };
}

async function hydrateCourseEnrollmentProgress(courses) {
  const courseIds = courses.map((course) => course.cid).filter(Boolean);

  if (!supabase || courseIds.length === 0) {
    return courses;
  }

  const { data, error } = await supabase
    .from("student_course")
    .select("cid, progress_percent")
    .in("cid", courseIds);

  if (error) {
    console.warn("Course enrollment progress load failed:", error.message);
    return courses;
  }

  const enrollmentStatsByCourseId = (data || []).reduce((stats, row) => {
    const courseId = String(row.cid);

    if (!stats[courseId]) {
      stats[courseId] = {
        count: 0,
        totalProgress: 0,
      };
    }

    stats[courseId].count += 1;
    stats[courseId].totalProgress += Number(row.progress_percent || 0);

    return stats;
  }, {});

  return courses.map((course) => {
    const stats = enrollmentStatsByCourseId[String(course.cid)];
    const studentCount = stats?.count || 0;
    const averageProgress =
      studentCount > 0
        ? Math.round(stats.totalProgress / studentCount)
        : 0;

    return {
      ...course,
      students: String(studentCount),
      studentCount,
      progress: averageProgress,
    };
  });
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

function formatCourseAmount(amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "Not set";
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return "Not set";
  }

  if (numericAmount === 0) {
    return "Free";
  }

  return `LKR ${numericAmount.toFixed(2)}`;
}
