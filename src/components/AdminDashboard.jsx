import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const VERIFY_DOCS_BUCKET = "verify_docs_t";

export default function AdminDashboard({ adminSession, onSignOut }) {
  const [teachers, setTeachers] = useState([]);
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

    async function loadTeachers() {
      setLoading(true);
      setMessage("");
      setAccessNotice("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data, error } = await supabase
        .from("teacher")
        .select("*")
        .order("tid", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        setMessage(`Failed to load teacher requests: ${error.message}`);
        setTeachers([]);
        setDocUrls({});
        setLoading(false);
        return;
      }

      const teacherRows = data || [];
      setTeachers(teacherRows);

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

      if (!ignore) {
        setDocUrls(Object.fromEntries(publicUrlEntries));
        setLoading(false);
      }
    }

    void loadTeachers();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleVerifyTeacher(teacher) {
    setVerifyingId(teacher.tid);
    setMessage("");

    const { error } = await supabase
      .from("teacher")
      .update({
        verification_status: "verified",
        verified_at: new Date().toISOString(),
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
              verified_at: new Date().toISOString(),
            }
          : currentTeacher
      )
    );
    setVerifyingId(null);
  }

  return (
    <div className="exp-shell">
      <div className="exp-orb" />
      <div className="exp-orb-alt" />
      <div className="exp-orb-soft" />
      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <section className="exp-frame p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="exp-sticker">
                Admin workspace
              </p>
              <h1 className="exp-title mt-5 text-3xl font-semibold sm:text-4xl">
                Pending teacher verification.
                <span className="exp-highlight block pt-2">
                  Review with a softer command center.
                </span>
              </h1>
              <p className="exp-muted mt-3 max-w-2xl text-sm leading-relaxed">
                Review lecturer profiles, open their proof links, and mark them
                as verified once approved.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="exp-card p-3 text-sm">
                <p className="text-slate-500 dark:text-white/50">
                  Signed in as
                </p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {adminSession.username}
                </p>
              </div>
              <div className="exp-card p-3 text-sm">
                <p className="text-slate-500 dark:text-white/50">Pending</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {pendingTeachers.length}
                </p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="exp-secondary-button px-4 py-2.5 text-sm"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <p className="exp-card mt-5 px-4 py-3 text-sm text-amber-700 dark:text-amber-100">
            {message}
          </p>
        ) : null}

        {accessNotice ? (
          <p className="exp-card mt-5 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
            {accessNotice}
          </p>
        ) : null}

        {loading ? (
          <section className="exp-frame mt-6 p-5">
            <p className="text-sm text-slate-600 dark:text-white/65">
              Loading teacher requests...
            </p>
          </section>
        ) : pendingTeachers.length === 0 ? (
          <section className="exp-frame mt-6 p-5">
            <h2 className="text-xl font-semibold">
              {accessNotice ? "No accessible pending teachers" : "No pending teachers"}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-white/65">
              {accessNotice
                ? "Pending rows may exist in Supabase, but this admin client cannot read them under the current RLS setup."
                : "Every lecturer request is already verified or there are no teacher submissions yet."}
            </p>
          </section>
        ) : (
          <div className="mt-6 grid gap-5">
            {pendingTeachers.map((teacher) => (
              <article
                key={teacher.tid}
                className="exp-frame p-5"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
                        Teacher
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        {teacher.full_name || "Unnamed lecturer"}
                      </h2>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-white/65">
                      {teacher.email || "No email"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill>
                        {formatVerificationStatus(teacher.verification_status)}
                      </StatusPill>
                      {teacher.tid ? <StatusPill>TID {teacher.tid}</StatusPill> : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVerifyTeacher(teacher)}
                    disabled={verifyingId === teacher.tid}
                    className="exp-primary-button px-4 py-2.5 text-sm"
                  >
                    {verifyingId === teacher.tid ? "Verifying..." : "Verify teacher"}
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Detail label="Qualification" value={teacher.academic_qualification} />
                  <Detail label="Field of study" value={teacher.field_of_study} />
                  <Detail label="Institution" value={teacher.institution_name} />
                  <Detail label="Staff / student ID" value={teacher.staff_or_student_id} />
                  <Detail label="Verified at" value={formatVerifiedAt(teacher.verified_at)} />
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <LinkCard label="LinkedIn" href={teacher.linkedin_url} />
                  <LinkCard label="GitHub" href={teacher.github_url} />
                  <DocumentCard
                    label="Verification document"
                    url={docUrls[teacher.tid]}
                    path={teacher.verify_doc}
                    onPreview={() =>
                      setPreviewDocument({
                        name: `${teacher.full_name || "Teacher"} verification document`,
                        path: teacher.verify_doc,
                        url: docUrls[teacher.tid],
                      })
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {previewDocument ? (
        <DocumentPreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="exp-card p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-white/40">
        {label}
      </p>
      <p className="mt-2 font-medium text-slate-900 dark:text-white">
        {value || "Not provided"}
      </p>
    </div>
  );
}

function LinkCard({ label, href, fallback = "Not provided" }) {
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="exp-secondary-button px-4 py-2.5 text-sm"
    >
      Open {label}
    </a>
  ) : (
    <div className="exp-card px-4 py-3 text-sm text-slate-500 dark:text-white/55">
      {label}: {fallback}
    </div>
  );
}

function DocumentCard({ label, url, path, onPreview }) {
  if (!url || !path) {
    return (
      <div className="exp-card px-4 py-3 text-sm text-slate-500 dark:text-white/55">
        {label}: Not uploaded
      </div>
    );
  }

  const documentType = getDocumentType(path);

  return (
    <div className="exp-card px-4 py-3">
      <p className="text-sm font-medium text-slate-900 dark:text-white">
        {label}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
        {documentType === "image"
          ? "Opens as an image preview."
          : documentType === "pdf"
            ? "Opens as an embedded PDF file."
            : "Opens as a file preview with external open/download links."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="exp-primary-button px-3 py-2 text-sm"
        >
          Preview
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="exp-secondary-button px-3 py-2 text-sm"
        >
          Open in new tab
        </a>
      </div>
    </div>
  );
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

function formatVerifiedAt(value) {
  if (!value) {
    return "Not verified yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
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
