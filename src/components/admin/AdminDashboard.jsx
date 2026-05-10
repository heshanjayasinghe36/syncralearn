import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  MoreVertical,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import "./AdminDashboard.css";
import AdminVerificationPage from "./AdminVerificationPage";
import { supabase } from "../../lib/supabase";
import CoursePreviewPage from "../teacher/CoursePreviewPage";

const VERIFY_DOCS_BUCKET = "verify_docs_t";

const adminSidebarItems = [
  {
    id: "users",
    label: "Users",
    icon: <Users aria-hidden="true" />,
  },
  {
    id: "verification",
    label: "Verification",
    icon: <ShieldCheck aria-hidden="true" />,
  },
  {
    id: "courses",
    label: "Courses",
    icon: <BookOpen aria-hidden="true" />,
  },
];

export default function AdminDashboard({ adminSession, onSignOut }) {
  const [activeView, setActiveView] = useState("users");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [docUrls, setDocUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState(null);
  const [deletingUserKey, setDeletingUserKey] = useState("");
  const [updatingCourseId, setUpdatingCourseId] = useState(null);
  const [deletingCourseId, setDeletingCourseId] = useState(null);
  const [message, setMessage] = useState("");
  const [accessNotice, setAccessNotice] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);

  const pendingTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      const status = (teacher.verification_status || "pending").toLowerCase();
      return status !== "verified";
    });
  }, [teachers]);

  useEffect(() => {
    let ignore = false;

    async function loadAdminData() {
      setLoading(true);
      setMessage("");
      setAccessNotice("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const [
        { data: teacherData, error: teacherError },
        { data: studentData, error: studentError },
        { data: courseData, error: courseError },
      ] =
        await Promise.all([
          supabase.from("teacher").select("*").order("tid", { ascending: false }),
          supabase.from("student").select("*").order("sid", { ascending: false }),
          supabase
            .from("course")
            .select(
              "cid, name, description, teachingstyle, amount, tid, level, status, img_url, teacher(full_name, email)"
            )
            .order("cid", { ascending: false }),
        ]);

      if (ignore) {
        return;
      }

      if (teacherError || studentError || courseError) {
        setMessage(
          `Failed to load admin data: ${
            teacherError?.message ||
            studentError?.message ||
            courseError?.message ||
            "Unknown error"
          }`
        );
        setTeachers([]);
        setStudents([]);
        setCourses([]);
        setDocUrls({});
        setLoading(false);
        return;
      }

      const teacherRows = teacherData || [];
      const studentRows = studentData || [];

      setTeachers(teacherRows);
      setStudents(studentRows);
      setCourses((courseData || []).map(mapCourseRowForAdmin));

      if (teacherRows.length === 0 && !session?.user) {
        setAccessNotice(
          "No teacher rows were accessible to this admin session. Your admin login is local-only, so teacher RLS policies are likely hiding pending requests."
        );
      }

      const publicUrlEntries = teacherRows.map((teacher) => {
        if (!teacher.verify_doc) {
          return [teacher.tid, ""];
        }

        const { data: publicData } = supabase.storage
          .from(VERIFY_DOCS_BUCKET)
          .getPublicUrl(teacher.verify_doc);

        return [teacher.tid, publicData.publicUrl || ""];
      });

      setDocUrls(Object.fromEntries(publicUrlEntries));
      setLoading(false);
    }

    void loadAdminData();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleVerifyTeacher(teacher) {
    setVerifyingId(teacher.tid);
    setMessage("");

    const verifiedAt = new Date().toISOString();

    const { error } = await supabase
      .from("teacher")
      .update({
        verification_status: "verified",
        verified_at: verifiedAt,
      })
      .eq("tid", teacher.tid);

    if (error) {
      setMessage(`Failed to verify teacher: ${error.message}`);
      setVerifyingId(null);
      return;
    }

    setTeachers((currentTeachers) =>
      currentTeachers.map((currentTeacher) =>
        currentTeacher.tid === teacher.tid
          ? {
              ...currentTeacher,
              verification_status: "verified",
              verified_at: verifiedAt,
            }
          : currentTeacher
      )
    );
    setVerifyingId(null);
  }

  async function handleDeleteUser(user) {
    const confirmed = window.confirm(
      `Delete ${user.role.toLowerCase()} "${user.name}" (${user.idLabel})?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserKey(user.key);
    setMessage("");

    const isStudent = user.role === "Student";
    const tableName = isStudent ? "student" : "teacher";
    const idColumn = isStudent ? "sid" : "tid";
    const idValue = isStudent ? user.idValue : user.idValue;

    const { error } = await supabase.from(tableName).delete().eq(idColumn, idValue);

    if (error) {
      setMessage(`Failed to delete user: ${error.message}`);
      setDeletingUserKey("");
      return;
    }

    if (isStudent) {
      setStudents((currentStudents) =>
        currentStudents.filter((student) => student.sid !== idValue)
      );
    } else {
      setTeachers((currentTeachers) =>
        currentTeachers.filter((teacher) => teacher.tid !== idValue)
      );
      setDocUrls((currentUrls) => {
        const nextUrls = { ...currentUrls };
        delete nextUrls[idValue];
        return nextUrls;
      });
    }

    setDeletingUserKey("");
  }

  async function handleDeleteCourse(course) {
    const confirmed = window.confirm(
      `Delete course "${course.name}" by ${course.teacherName}?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingCourseId(course.cid);
    setMessage("");

    const { error } = await supabase.from("course").delete().eq("cid", course.cid);

    if (error) {
      setMessage(`Failed to delete course: ${error.message}`);
      setDeletingCourseId(null);
      return;
    }

    setCourses((currentCourses) =>
      currentCourses.filter((currentCourse) => currentCourse.cid !== course.cid)
    );
    setDeletingCourseId(null);
  }

  async function handleToggleCourseHold(course) {
    const nextStatus = course.status === "hold" ? "active" : "hold";
    const actionLabel = nextStatus === "hold" ? "hold" : "activate";

    setUpdatingCourseId(course.cid);
    setMessage("");

    const { data, error } = await supabase
      .from("course")
      .update({ status: nextStatus })
      .eq("cid", course.cid)
      .select(
        "cid, name, description, teachingstyle, amount, tid, level, status, img_url, teacher(full_name, email)"
      )
      .single();

    if (error) {
      setMessage(`Failed to ${actionLabel} course: ${error.message}`);
      setUpdatingCourseId(null);
      return;
    }

    const updatedCourse = mapCourseRowForAdmin(data);

    setCourses((currentCourses) =>
      currentCourses.map((currentCourse) =>
        currentCourse.cid === updatedCourse.cid ? updatedCourse : currentCourse
      )
    );
    setUpdatingCourseId(null);
  }

  if (activeView === "course-preview" && selectedCourse) {
    return (
      <CoursePreviewPage
        course={selectedCourse}
        displayName={adminSession?.username || "Admin"}
        previewLabel="Admin Preview"
        pageLabel="Admin course preview"
        backLabel="Back to Courses"
        profileLabel="Admin"
        showStreak={false}
        onBack={() => {
          setSelectedCourse(null);
          setActiveView("courses");
        }}
      />
    );
  }

  return (
    <div className="teacher-dashboard-shell admin-dashboard-shell">
      <aside className="teacher-sidebar admin-sidebar">
        <div className="teacher-sidebar-brand">
          <div className="teacher-brand-mark">
            <GraduationCap aria-hidden="true" />
          </div>

          <div>
            <p className="teacher-brand-name">Syncra Learn</p>
            <p className="teacher-brand-kicker">Admin Portal</p>
          </div>
        </div>

        <nav className="teacher-sidebar-nav" aria-label="Admin dashboard">
          {adminSidebarItems.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={`teacher-sidebar-link ${activeView === id ? "is-active" : ""}`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-status">
  <button
    type="button"
    onClick={onSignOut}
    className="admin-sidebar-signout-button"
  >
    Sign out
  </button>
</div>
      </aside>

      <section className="teacher-dashboard-main admin-dashboard-main">
        <main className="teacher-dashboard-empty admin-dashboard-content">
          {message ? (
            <p className="exp-card admin-dashboard-alert admin-dashboard-alert-warning">
              {message}
            </p>
          ) : null}

          {accessNotice ? (
            <p className="exp-card admin-dashboard-alert admin-dashboard-alert-danger">
              {accessNotice}
            </p>
          ) : null}

          {activeView === "users" ? (
            <AdminUsersView
              adminSession={adminSession}
              students={students}
              teachers={teachers}
              loading={loading}
              deletingUserKey={deletingUserKey}
              onDeleteUser={handleDeleteUser}
              onSignOut={onSignOut}
            />
          ) : activeView === "verification" ? (
            <AdminVerificationPage
              adminSession={adminSession}
              pendingTeachers={pendingTeachers}
              loading={loading}
              verifyingId={verifyingId}
              docUrls={docUrls}
              onVerifyTeacher={handleVerifyTeacher}
              onPreviewDocument={setPreviewDocument}
              onSignOut={onSignOut}
              accessNotice={accessNotice}
            />
          ) : (
            <AdminCoursesView
              courses={courses}
              loading={loading}
              deletingCourseId={deletingCourseId}
              updatingCourseId={updatingCourseId}
              onDeleteCourse={handleDeleteCourse}
              onToggleCourseHold={handleToggleCourseHold}
              onOpenCourse={(course) => {
                setSelectedCourse(course);
                setActiveView("course-preview");
              }}
            />
          )}
        </main>
      </section>

      {previewDocument ? (
        <DocumentPreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}

function AdminUsersView({
  adminSession,
  students,
  teachers,
  loading,
  deletingUserKey,
  onDeleteUser,
  onSignOut,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [openActionKey, setOpenActionKey] = useState("");
  const actionsRef = useRef(null);

  const userRows = useMemo(() => {
      const studentRows = students.map((student) => ({
        key: `student-${student.sid}`,
        role: "Student",
        idLabel: `SID ${student.sid}`,
        idValue: student.sid,
      name: student.full_name || "Unnamed student",
      email: student.email || "No email",
      activity: formatRelativeDate(student.last_active_at || student.vark_completed_at),
      accent: "student",
    }));

      const teacherRows = teachers.map((teacher) => ({
        key: `teacher-${teacher.tid}`,
        role: "Teacher",
        idLabel: `TID ${teacher.tid}`,
        idValue: teacher.tid,
      name: teacher.full_name || "Unnamed teacher",
      email: teacher.email || "No email",
      activity: formatRelativeDate(teacher.verified_at),
      accent: "teacher",
    }));

    return [...studentRows, ...teacherRows].sort((left, right) => right.idValue - left.idValue);
  }, [students, teachers]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return userRows.filter((row) => {
      const matchesRole =
        roleFilter === "all" ? true : row.role.toLowerCase() === roleFilter;

      if (!matchesRole) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.idLabel.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [roleFilter, searchQuery, userRows]);

  const visibleStart = filteredRows.length > 0 ? 1 : 0;
  const visibleEnd = filteredRows.length;

  useEffect(() => {
    function handlePointerDown(event) {
      if (!actionsRef.current?.contains(event.target)) {
        setOpenActionKey("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          {/* <p className="admin-page-kicker">Admin Portal</p> */}
          <h1>Users</h1>
          <br />
          {/* <p>Review student and teacher accounts from one place.</p> */}
        </div>
      </div>

      {loading ? (
        <section className="exp-frame admin-loading-card">
          <p>Loading users...</p>
        </section>
      ) : (
        <section className="exp-frame admin-users-table-card">
          <div className="admin-users-toolbar">
            <label className="admin-users-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                placeholder="Search users by name, email, or ID..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <label className="admin-users-filter">
              <span>Role: {roleFilter === "all" ? "All" : roleFilter === "student" ? "Students" : "Teachers"}</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          </div>

          {filteredRows.length === 0 ? (
            <p className="admin-empty-state">No users match the current filters.</p>
          ) : (
            <div className="admin-users-table-wrap">
              <div className="admin-users-table admin-users-table-head" role="row">
                <span>User</span>
                <span>Role</span>
                <span>ID</span>
                <span>Activity</span>
                <span>Actions</span>
              </div>

              <div className="admin-users-table-body" ref={actionsRef}>
                {filteredRows.map((row) => (
                  <UserTableRow
                    key={row.key}
                    {...row}
                    isMenuOpen={openActionKey === row.key}
                    isDeleting={deletingUserKey === row.key}
                    onToggleMenu={() =>
                      setOpenActionKey((currentKey) =>
                        currentKey === row.key ? "" : row.key
                      )
                    }
                    onDelete={() => {
                      setOpenActionKey("");
                      void onDeleteUser(row);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="admin-users-footer">
            <p>
              Showing {visibleStart}-{visibleEnd} of {userRows.length} users
            </p>
          </div>
        </section>
      )}
    </section>
  );
}

function UserTableRow({
  role,
  idLabel,
  name,
  email,
  activity,
  accent,
  isMenuOpen,
  isDeleting,
  onToggleMenu,
  onDelete,
}) {
  return (
    <article className="admin-users-table admin-users-table-row">
      <div className="admin-users-user-cell">
        <span className={`admin-users-avatar ${accent}`}>
          {getInitials(name)}
        </span>
        <div>
          <h3>{name}</h3>
          <p>{email}</p>
        </div>
      </div>

      <div>
        <span className={`admin-role-pill ${accent}`}>{role}</span>
      </div>

      <div className="admin-users-id-cell">
        <strong>{idLabel}</strong>
      </div>

      <div className="admin-users-activity-cell">
        <span>{activity}</span>
      </div>

      <div className="admin-users-actions-cell">
        <button
          type="button"
          className="admin-users-action-button"
          aria-label={`Actions for ${name}`}
          aria-expanded={isMenuOpen}
          onClick={onToggleMenu}
        >
          <MoreVertical aria-hidden="true" />
        </button>

        {isMenuOpen ? (
          <div className="admin-users-action-menu">
            <button type="button" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete user"}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AdminCoursesView({
  courses,
  loading,
  deletingCourseId,
  updatingCourseId,
  onDeleteCourse,
  onToggleCourseHold,
  onOpenCourse,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openActionKey, setOpenActionKey] = useState("");
  const actionsRef = useRef(null);

  const filteredCourses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return courses;
    }

    return courses.filter((course) => {
      return (
        course.name.toLowerCase().includes(normalizedQuery) ||
        course.teacherName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [courses, searchQuery]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!actionsRef.current?.contains(event.target)) {
        setOpenActionKey("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Courses</h1>
        </div>
      </div>

      {loading ? (
        <section className="exp-frame admin-loading-card">
          <p>Loading courses...</p>
        </section>
      ) : (
        <section className="exp-frame admin-users-table-card">
          <div className="admin-users-toolbar">
            <label className="admin-users-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                placeholder="Search by course name or teacher name..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>

          {filteredCourses.length === 0 ? (
            <p className="admin-empty-state">No courses match the current search.</p>
          ) : (
            <div className="admin-course-grid" ref={actionsRef}>
              {filteredCourses.map((course) => (
                <AdminCourseCard
                  key={course.cid}
                  course={course}
                  isMenuOpen={openActionKey === String(course.cid)}
                  isDeleting={deletingCourseId === course.cid}
                  isUpdating={updatingCourseId === course.cid}
                  onToggleMenu={() =>
                    setOpenActionKey((currentKey) =>
                      currentKey === String(course.cid) ? "" : String(course.cid)
                    )
                  }
                  onDelete={() => {
                    setOpenActionKey("");
                    void onDeleteCourse(course);
                  }}
                  onToggleHold={() => {
                    setOpenActionKey("");
                    void onToggleCourseHold(course);
                  }}
                  onOpen={() => onOpenCourse(course)}
                />
              ))}
            </div>
          )}

          <div className="admin-users-footer">
            <p>
              Showing {filteredCourses.length} of {courses.length} courses
            </p>
          </div>
        </section>
      )}
    </section>
  );
}

function AdminCourseCard({
  course,
  isMenuOpen,
  isDeleting,
  isUpdating,
  onToggleMenu,
  onDelete,
  onToggleHold,
  onOpen,
}) {
  const holdLabel = course.status === "hold" ? "Activate course" : "Hold course";

  function handleCardKeyDown(event) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onOpen();
  }

  return (
    <article
      className="admin-course-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open preview for ${course.name}`}
    >
      <div className={`admin-course-visual ${course.imgUrl ? "has-image" : ""}`}>
        {course.imgUrl ? <img src={course.imgUrl} alt={`${course.name} cover`} /> : null}
        {!course.imgUrl ? <BookOpen aria-hidden="true" /> : null}
      </div>

      <div className="admin-course-card-body">
        <div className="admin-course-card-top">
          <div>
            <div className="admin-course-card-pills">
              <span className={`admin-role-pill ${getAdminCourseStatusAccent(course.status)}`}>
                {formatCourseStatus(course.status)}
              </span>
              <span className="admin-role-pill teacher">
                {formatAdminCourseLevel(course.level)}
              </span>
            </div>
            <h3>{course.name}</h3>
            <p className="admin-course-teacher">Teacher: {course.teacherName}</p>
            <p className="admin-course-email">{course.teacherEmail}</p>
          </div>

          <div className="admin-users-actions-cell">
            <button
              type="button"
              className="admin-users-action-button"
              aria-label={`Actions for ${course.name}`}
              aria-expanded={isMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMenu();
              }}
            >
              <MoreVertical aria-hidden="true" />
            </button>

            {isMenuOpen ? (
              <div
                className="admin-users-action-menu"
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" onClick={onToggleHold} disabled={isUpdating}>
                  {isUpdating
                    ? course.status === "hold"
                      ? "Activating..."
                      : "Holding..."
                    : holdLabel}
                </button>
                <button type="button" onClick={onDelete} disabled={isDeleting}>
                  {isDeleting ? "Deleting..." : "Delete course"}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <p className="admin-course-description">
          {course.description || "No description added for this course."}
        </p>

        <div className="admin-course-details">
          <span>Course ID: CID {course.cid}</span>
          <span>Amount: {formatCourseAmount(course.amount)}</span>
          <span>Teaching style: {course.teachingStyle || "Not set"}</span>
        </div>
      </div>
    </article>
  );
}

function formatRelativeDate(value) {
  if (!value) {
    return "No activity yet";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const deltaMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) {
    return "Just now";
  }

  if (deltaMs < hour) {
    const minutes = Math.max(1, Math.floor(deltaMs / minute));
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  if (deltaMs < day) {
    const hours = Math.max(1, Math.floor(deltaMs / hour));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.max(1, Math.floor(deltaMs / day));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function DocumentPreviewModal({ document, onClose }) {
  const documentType = getDocumentType(document.path);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-md">
      <div className="exp-frame relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/20 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-white/40">
              Verification Document
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {document.name}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={document.url}
              target="_blank"
              rel="noreferrer"
              className="exp-secondary-button px-3 py-2 text-sm"
            >
              Open in new tab
            </a>
            <a
              href={document.url}
              download
              className="exp-secondary-button px-3 py-2 text-sm"
            >
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="exp-primary-button px-3 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-[22rem] flex-1 overflow-auto bg-white/15 p-4 dark:bg-slate-950/20">
          {documentType === "image" ? (
            <img
              src={document.url}
              alt={document.name}
              className="mx-auto max-h-[70vh] rounded-lg object-contain shadow-lg"
            />
          ) : documentType === "pdf" ? (
            <iframe
              title={document.name}
              src={document.url}
              className="exp-card h-[70vh] w-full bg-white/70"
            />
          ) : (
            <div className="exp-card flex h-full min-h-[22rem] flex-col items-center justify-center px-5 py-8 text-center">
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                Preview is not available for this file type.
              </p>
              <p className="mt-2 max-w-lg text-sm text-slate-600 dark:text-white/65">
                Open the file in a new tab or download it to inspect the
                uploaded verification document.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getDocumentType(path) {
  const normalizedPath = path?.toLowerCase() || "";

  if (
    normalizedPath.endsWith(".png") ||
    normalizedPath.endsWith(".jpg") ||
    normalizedPath.endsWith(".jpeg") ||
    normalizedPath.endsWith(".webp") ||
    normalizedPath.endsWith(".gif")
  ) {
    return "image";
  }

  if (normalizedPath.endsWith(".pdf")) {
    return "pdf";
  }

  return "file";
}

function mapCourseRowForAdmin(row) {
  return {
    cid: row?.cid || null,
    name: row?.name || "Untitled course",
    description: row?.description || "",
    amount: row?.amount ?? "",
    level: row?.level || "",
    status: (row?.status || "draft").toLowerCase(),
    imgUrl: row?.img_url || "",
    teachingStyle: row?.teachingstyle || "",
    teacherName: row?.teacher?.full_name || "Unknown teacher",
    teacherEmail: row?.teacher?.email || "No email",
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

function formatAdminCourseLevel(value) {
  if (!value) {
    return "No level";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAdminCourseStatusAccent(status) {
  if (status === "active") {
    return "teacher";
  }

  if (status === "hold") {
    return "student";
  }

  return "admin-neutral";
}
