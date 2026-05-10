import { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import "./AdminDashboard.css";
import AdminVerificationPage from "./AdminVerificationPage";
import { supabase } from "../../lib/supabase";

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
];

export default function AdminDashboard({ adminSession, onSignOut }) {
  const [activeView, setActiveView] = useState("users");
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [docUrls, setDocUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState(null);
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

      const [{ data: teacherData, error: teacherError }, { data: studentData, error: studentError }] =
        await Promise.all([
          supabase.from("teacher").select("*").order("tid", { ascending: false }),
          supabase.from("student").select("*").order("sid", { ascending: false }),
        ]);

      if (ignore) {
        return;
      }

      if (teacherError || studentError) {
        setMessage(
          `Failed to load admin data: ${
            teacherError?.message || studentError?.message || "Unknown error"
          }`
        );
        setTeachers([]);
        setStudents([]);
        setDocUrls({});
        setLoading(false);
        return;
      }

      const teacherRows = teacherData || [];
      const studentRows = studentData || [];

      setTeachers(teacherRows);
      setStudents(studentRows);

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
              onSignOut={onSignOut}
            />
          ) : (
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

function AdminUsersView({ adminSession, students, teachers, loading, onSignOut }) {
  const totalUsers = students.length + teachers.length;

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

      <div className="admin-metric-grid">
        <MetricCard icon={<Users aria-hidden="true" />} label="Total users" value={totalUsers} />
        <MetricCard icon={<UserRound aria-hidden="true" />} label="Students" value={students.length} />
        <MetricCard
          icon={<GraduationCap aria-hidden="true" />}
          label="Teachers"
          value={teachers.length}
        />
      </div>

      {loading ? (
        <section className="exp-frame admin-loading-card">
          <p>Loading users...</p>
        </section>
      ) : (
        <div className="admin-user-layout">
          <section className="exp-frame admin-user-section">
            <div className="admin-section-heading">
              <h2>Students</h2>
              <span>{students.length}</span>
            </div>

            <div className="admin-user-grid">
              {students.length === 0 ? (
                <p className="admin-empty-state">No student accounts found.</p>
              ) : (
                students.map((student) => (
                  <UserCard
                    key={`student-${student.sid}`}
                    icon={<UserRound aria-hidden="true" />}
                    name={student.full_name || "Unnamed student"}
                    email={student.email || "No email"}
                    badge={`SID ${student.sid}`}
                    metaLeft={student.mls || "Learning style not set"}
                    metaRight={student.vark_completed ? "Profile complete" : "VARK pending"}
                  />
                ))
              )}
            </div>
          </section>

          <section className="exp-frame admin-user-section">
            <div className="admin-section-heading">
              <h2>Teachers</h2>
              <span>{teachers.length}</span>
            </div>

            <div className="admin-user-grid">
              {teachers.length === 0 ? (
                <p className="admin-empty-state">No teacher accounts found.</p>
              ) : (
                teachers.map((teacher) => (
                  <UserCard
                    key={`teacher-${teacher.tid}`}
                    icon={<GraduationCap aria-hidden="true" />}
                    name={teacher.full_name || "Unnamed teacher"}
                    email={teacher.email || "No email"}
                    badge={`TID ${teacher.tid}`}
                    metaLeft={teacher.field_of_study || "Field not provided"}
                    metaRight={formatVerificationStatus(teacher.verification_status)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="exp-card admin-metric-card">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function UserCard({ icon, name, email, badge, metaLeft, metaRight }) {
  return (
    <article className="exp-card admin-user-card">
      <div className="admin-user-card-heading">
        <span>{icon}</span>
        <div>
          <h3>{name}</h3>
          <p>{email}</p>
        </div>
      </div>

      <div className="admin-badge-row">
        <StatusPill>{badge}</StatusPill>
      </div>

      <div className="admin-user-card-meta">
        <small>{metaLeft}</small>
        <strong>{metaRight}</strong>
      </div>
    </article>
  );
}

function StatusPill({ children }) {
  return (
    <span className="exp-sticker px-3 py-1 text-xs text-slate-600 dark:text-white/65">
      {children}
    </span>
  );
}

function formatVerificationStatus(value) {
  if (!value) {
    return "Pending";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
