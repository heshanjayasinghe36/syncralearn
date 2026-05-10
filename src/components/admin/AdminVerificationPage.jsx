import {
  Building2,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  IdCard,
  Link as LinkIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function AdminVerificationPage({
  adminSession,
  pendingTeachers,
  loading,
  verifyingId,
  docUrls,
  onVerifyTeacher,
  onPreviewDocument,
  onSignOut,
  accessNotice,
}) {
  if (loading) {
    return (
      <section className="admin-page">
        <div className="admin-page-header admin-verification-hero">
          <div>
            <p className="admin-page-kicker">Admin Portal</p>
            <h1>Teacher Verification</h1>
            <p>Loading teacher requests...</p>
          </div>
        </div>

        <section className="exp-frame admin-loading-card">
          <p>Loading teacher requests...</p>
        </section>
      </section>
    );
  }

  if (pendingTeachers.length === 0) {
    return (
      <section className="admin-page">
        <div className="admin-page-header admin-verification-hero">
          <div>
            <p className="admin-page-kicker">Admin Portal</p>
            <h1>Teacher Verification</h1>
            <p>Review pending teacher accounts and approve them when documents check out.</p>
          </div>

          <div className="admin-page-actions">
            <div className="admin-session-card">
              <p>Signed in as admin</p>
              <strong>{adminSession?.username || "Admin"}</strong>
            </div>
            <div className="admin-session-card">
              <p>Pending</p>
              <strong>0</strong>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="exp-secondary-button admin-signout-button"
            >
              Sign out
            </button>
          </div>
        </div>

        <section className="exp-frame admin-loading-card">
          <h2>{accessNotice ? "No accessible pending teachers" : "No pending teachers"}</h2>
          <p>
            {accessNotice
              ? "Pending rows may exist in Supabase, but this admin client cannot read them under the current RLS setup."
              : "Every lecturer request is already verified or there are no teacher submissions yet."}
          </p>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-page admin-verification-page">
      {pendingTeachers.map((teacher) => {
        const activityItems = getVerificationActivity(teacher);
        const documentUrl = docUrls[teacher.tid];
        const documentType = getDocumentType(teacher.verify_doc);

        return (
          <div key={teacher.tid} className="admin-verification-case">
            <div className="admin-page-header admin-verification-hero">
              <div>
                <p className="admin-page-kicker">Admin Portal</p>
                <h1>Pending teacher verification.</h1>
                <p>Review with a softer command center.</p>
              </div>

              <div className="admin-verification-summary-card">
                <div>
                  <p>Signed in as admin</p>
                  <strong>{adminSession?.username || "Admin"}</strong>
                  <small>Pending: {pendingTeachers.length}</small>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="exp-secondary-button admin-signout-button"
                >
                  Sign out
                </button>
              </div>
            </div>

            <div className="admin-verification-layout admin-verification-top-grid">
              <section className="exp-frame admin-verification-profile-card">
                <div className="admin-verification-profile-main">
                  <div className="admin-verification-profile-id">
                    <div className="admin-avatar admin-avatar-photo">
                      <GraduationCap aria-hidden="true" />
                    </div>

                    <div className="admin-verification-profile-copy">
                      <h2>{teacher.full_name || "Unnamed lecturer"}</h2>
                      <p>{teacher.email || "No email"}</p>

                      <div className="admin-badge-row">
                        <span className="admin-status-chip is-pending">
                          {formatVerificationStatus(teacher.verification_status)}
                        </span>
                        <span className="admin-status-chip is-id">TID {teacher.tid}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onVerifyTeacher(teacher)}
                    disabled={verifyingId === teacher.tid}
                    className="exp-primary-button admin-verify-button admin-verify-button-large"
                  >
                    <ShieldCheck aria-hidden="true" />
                    <span>
                      {verifyingId === teacher.tid ? "Verifying..." : "Verify teacher"}
                    </span>
                  </button>
                </div>

                <div className="admin-verification-profile-links">
                  <InlineLink label="LinkedIn" href={teacher.linkedin_url} />
                  <InlineLink label="GitHub" href={teacher.github_url} />
                </div>
              </section>

              <aside className="admin-verification-facts-grid">
                <FactCard
                  icon={<GraduationCap aria-hidden="true" />}
                  label="Qualification"
                  value={teacher.academic_qualification}
                  tone="mint"
                />
                <FactCard
                  icon={<Sparkles aria-hidden="true" />}
                  label="Field of Study"
                  value={teacher.field_of_study}
                  tone="lavender"
                />
                <FactCard
                  icon={<Building2 aria-hidden="true" />}
                  label="Institution"
                  value={teacher.institution_name}
                  tone="peach"
                />
                <FactCard
                  icon={<IdCard aria-hidden="true" />}
                  label="Staff / Student ID"
                  value={teacher.staff_or_student_id}
                  tone="mint"
                />
              </aside>
            </div>

            <div className="admin-verification-layout admin-verification-bottom-grid">
              <section className="exp-frame admin-verification-document-panel">
                <div className="admin-verification-document-head">
                  <div className="admin-verification-document-title">
                    <span>
                      <FileText aria-hidden="true" />
                    </span>
                    <div>
                      <h3>Verification document</h3>
                    </div>
                  </div>

                  <div className="admin-document-actions">
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewDocument({
                          name: `${teacher.full_name || "Teacher"} verification document`,
                          path: teacher.verify_doc,
                          url: documentUrl,
                        })
                      }
                      disabled={!documentUrl || !teacher.verify_doc}
                      className="exp-primary-button admin-inline-button admin-preview-button"
                    >
                      <Eye aria-hidden="true" />
                      <span>Preview</span>
                    </button>

                    <a
                      href={documentUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="exp-secondary-button admin-inline-button admin-open-button"
                      aria-disabled={!documentUrl || !teacher.verify_doc}
                      onClick={(event) => {
                        if (!documentUrl || !teacher.verify_doc) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <ExternalLink aria-hidden="true" />
                      <span>Open in new tab</span>
                    </a>
                  </div>
                </div>

                <div className="admin-document-preview-surface">
                  {documentUrl && teacher.verify_doc ? (
                    documentType === "image" ? (
                      <img
                        src={documentUrl}
                        alt={`${teacher.full_name || "Teacher"} verification document`}
                        className="admin-document-preview-image"
                      />
                    ) : documentType === "pdf" ? (
                      <iframe
                        title={`${teacher.full_name || "Teacher"} verification document`}
                        src={documentUrl}
                        className="admin-document-preview-iframe"
                      />
                    ) : null
                  ) : null}

                  <button
                    type="button"
                    className="admin-document-preview-overlay"
                    onClick={() =>
                      onPreviewDocument({
                        name: `${teacher.full_name || "Teacher"} verification document`,
                        path: teacher.verify_doc,
                        url: documentUrl,
                      })
                    }
                    disabled={!documentUrl || !teacher.verify_doc}
                  >
                    <div className="admin-document-preview-tile">
                      <FileText aria-hidden="true" />
                      <strong>{teacher.verify_doc || "Document not uploaded"}</strong>
                      <span>
                        {documentUrl && teacher.verify_doc
                          ? "Click to expand preview"
                          : "No document available"}
                      </span>
                    </div>
                  </button>
                </div>
              </section>

              <section className="exp-frame admin-activity-card">
                <h3>Activity Log</h3>
                <div className="admin-activity-list">
                  {activityItems.map((item, index) => (
                    <div key={`${teacher.tid}-${item.label}-${index}`} className="admin-activity-item">
                      <span className={`admin-activity-dot ${item.active ? "is-active" : ""}`} />
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="exp-card admin-verified-at-card">
                  <p>Verified At</p>
                  <strong>{formatVerifiedAt(teacher.verified_at)}</strong>
                </div>
              </section>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function FactCard({ icon, label, value, tone = "mint" }) {
  return (
    <div className={`exp-card admin-fact-card is-${tone}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value || "Not provided"}</strong>
    </div>
  );
}

function InlineLink({ label, href }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="admin-inline-link">
      <span>{label}</span>
      <strong>{new URL(href).hostname.replace(/^www\./, "")}</strong>
      <ExternalLink aria-hidden="true" />
    </a>
  ) : (
    <div className="admin-inline-link is-muted">
      <span>{label}</span>
      <strong>Not provided</strong>
      <LinkIcon aria-hidden="true" />
    </div>
  );
}

function getVerificationActivity(teacher) {
  const items = [];

  if (teacher.verify_doc) {
    items.push({
      label: "Submitted for review",
      time: "Verification document uploaded",
      active: true,
    });
  }

  items.push({
    label: "Account profile ready",
    time: teacher.email || "Teacher account available",
    active: !teacher.verify_doc,
  });

  if (teacher.verified_at) {
    items.unshift({
      label: "Verified by admin",
      time: formatVerifiedAt(teacher.verified_at),
      active: true,
    });
  }

  return items.slice(0, 3);
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
