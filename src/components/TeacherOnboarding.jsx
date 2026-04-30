import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const VERIFY_DOCS_BUCKET = "verify_docs_t";

const ACADEMIC_QUALIFICATIONS = [
  {
    value: "Diploma",
    label: "Diploma",
    badge: "DIP",
    description: "Professional or foundation-level qualification.",
  },
  {
    value: "Higher National Diploma",
    label: "Higher National Diploma",
    badge: "HND",
    description: "Applied higher education qualification.",
  },
  {
    value: "BSc",
    label: "BSc",
    badge: "BSc",
    description: "Bachelor of Science degree.",
  },
  {
    value: "BA",
    label: "BA",
    badge: "BA",
    description: "Bachelor of Arts degree.",
  },
  {
    value: "BEng",
    label: "BEng",
    badge: "BE",
    description: "Bachelor of Engineering degree.",
  },
  {
    value: "BTech",
    label: "BTech",
    badge: "BT",
    description: "Bachelor of Technology degree.",
  },
  {
    value: "MSc",
    label: "MSc",
    badge: "MSc",
    description: "Master of Science degree.",
  },
  {
    value: "MA",
    label: "MA",
    badge: "MA",
    description: "Master of Arts degree.",
  },
  {
    value: "MEng",
    label: "MEng",
    badge: "ME",
    description: "Master of Engineering degree.",
  },
  {
    value: "MPhil",
    label: "MPhil",
    badge: "MP",
    description: "Research-focused postgraduate degree.",
  },
  {
    value: "PhD",
    label: "PhD",
    badge: "PhD",
    description: "Doctor of Philosophy qualification.",
  },
  {
    value: "EdD",
    label: "EdD",
    badge: "EdD",
    description: "Doctorate focused on education practice.",
  },
];

const FIELD_OF_STUDY_OPTIONS = [
  {
    value: "Computer Science",
    label: "Computer Science",
    badge: "CS",
    description: "Programming, algorithms, systems, and theory.",
  },
  {
    value: "Software Engineering",
    label: "Software Engineering",
    badge: "SE",
    description: "Software design, testing, architecture, and delivery.",
  },
  {
    value: "Information Technology",
    label: "Information Technology",
    badge: "IT",
    description: "Infrastructure, networks, services, and applied systems.",
  },
  {
    value: "Data Science",
    label: "Data Science",
    badge: "DS",
    description: "Analytics, machine learning, statistics, and data tools.",
  },
];

export default function TeacherOnboarding({
  session,
  theme = "light",
  onToggleTheme,
  onCompleted,
  onSignOut,
}) {
  const [academicQualification, setAcademicQualification] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [staffOrStudentId, setStaffOrStudentId] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [verifyDocument, setVerifyDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const linkedinOk =
    linkedinUrl.trim().length === 0 || isValidUrl(linkedinUrl);
  const githubOk = githubUrl.trim().length === 0 || isValidUrl(githubUrl);

  const canSubmit = useMemo(() => {
    return (
      academicQualification.length > 0 &&
      fieldOfStudy.length > 0 &&
      institutionName.trim().length >= 2 &&
      Boolean(verifyDocument) &&
      linkedinOk &&
      githubOk &&
      !loading
    );
  }, [
    academicQualification,
    fieldOfStudy,
    institutionName,
    verifyDocument,
    linkedinOk,
    githubOk,
    loading,
  ]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      setMessage(
        "Please complete the required fields and upload a verification document."
      );
      return;
    }

    if (!session?.user?.id) {
      setMessage("No authenticated user found.");
      return;
    }

    setLoading(true);
    setMessage("");

    const user = session.user;
    let verifyDocPath = null;

    if (verifyDocument) {
      const safeFileName = verifyDocument.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${user.id}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(VERIFY_DOCS_BUCKET)
        .upload(filePath, verifyDocument, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(
          `Document upload failed: ${uploadError.message}`
        );
        setLoading(false);
        return;
      }

      verifyDocPath = filePath;
    }

    const { error } = await supabase
      .from("teacher")
      .upsert(
        {
          auth_user_id: user.id,
          full_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Lecturer",
          email: user.email,
          academic_qualification: academicQualification.trim(),
          field_of_study: fieldOfStudy.trim(),
          institution_name: institutionName.trim(),
          staff_or_student_id: staffOrStudentId.trim() || null,
          linkedin_url: linkedinUrl.trim() || null,
          github_url: githubUrl.trim() || null,
          verify_doc: verifyDocPath,
          verification_status: "pending",
          verified_at: null,
        },
        { onConflict: "auth_user_id" }
      );

    if (error) {
      setMessage(`Teacher profile save failed: ${error.message}`);
      setLoading(false);
      return;
    }

    await onCompleted?.();
    setLoading(false);
  }

  return (
    <div className="exp-shell teacher-onboarding-page text-slate-900 dark:text-white">
      <header className="exp-auth-nav teacher-onboarding-nav">
        <span className="exp-auth-brand">Syncra Learn</span>
        <div className="exp-auth-actions">
          <button
            type="button"
            className="exp-auth-theme-toggle"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            <span
              className={`exp-auth-theme-icon ${
                theme === "light" ? "is-active" : ""
              }`}
            >
              <SunIcon />
            </span>
            <span
              className={`exp-auth-theme-icon ${
                theme === "dark" ? "is-active" : ""
              }`}
            >
              <MoonIcon />
            </span>
          </button>
        </div>
      </header>

      <div className="exp-orb" />
      <div className="exp-orb-alt" />
      <div className="exp-orb-soft" />
      <div className="relative mx-auto max-w-3xl px-4 py-8">
      <div className="exp-frame relative p-5 sm:p-6">
        <div className="exp-sticker">
          <span>Teacher verification</span>
        </div>

        <h1 className="exp-title mt-5 text-3xl font-semibold sm:text-4xl">
          Complete your lecturer profile.
          <span className="exp-highlight block pt-2">
            Keep the proof polished and friendly.
          </span>
        </h1>

        <p className="exp-muted mt-3 max-w-2xl text-sm leading-relaxed">
          Submit your academic and professional details for review. Your teacher
          account will be created as unverified until an admin approves it.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Academic qualification"
              hint="Required"
            >
              <DropdownSelect
                value={academicQualification}
                onChange={(nextValue) => {
                  setAcademicQualification(nextValue);
                  setMessage("");
                }}
                options={ACADEMIC_QUALIFICATIONS}
                placeholder="Select qualification..."
                groupLabel="Qualification"
                disabled={loading}
              />
            </Field>

            <Field label="Field of study" hint="Required">
              <DropdownSelect
                value={fieldOfStudy}
                onChange={(nextValue) => {
                  setFieldOfStudy(nextValue);
                  setMessage("");
                }}
                options={FIELD_OF_STUDY_OPTIONS}
                placeholder="Select field..."
                groupLabel="Field"
                disabled={loading}
              />
            </Field>
          </div>

          <Field label="Institution name" hint="Required">
            <input
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              type="text"
              placeholder="University or workplace"
              className={inputClassName}
            />
          </Field>

          <Field
            label="Staff ID or student ID"
            hint="Optional"
          >
            <input
              value={staffOrStudentId}
              onChange={(event) => setStaffOrStudentId(event.target.value)}
              type="text"
              placeholder="Lecturer ID or postgraduate student ID"
              className={inputClassName}
            />
          </Field>

          <Field
            label="LinkedIn URL"
            hint="Optional"
          >
            <input
              value={linkedinUrl}
              onChange={(event) => setLinkedinUrl(event.target.value)}
              type="url"
              placeholder="https://www.linkedin.com/in/your-profile"
              className={inputClassName}
            />
            {!linkedinOk ? (
              <p className="exp-card mt-2 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
                Enter a valid URL starting with http:// or https://.
              </p>
            ) : null}
          </Field>

          <Field
            label="GitHub URL"
            hint="Optional, useful for tech lecturers"
          >
            <input
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              type="url"
              placeholder="https://github.com/your-handle"
              className={inputClassName}
            />
            {!githubOk ? (
              <p className="exp-card mt-2 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
                Enter a valid URL starting with http:// or https://.
              </p>
            ) : null}
          </Field>

          <Field
            label="Verification document"
            hint="Required: degree certificate, staff ID, or transcript"
          >
            <input
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) =>
                setVerifyDocument(event.target.files?.[0] || null)
              }
              className={`${inputClassName} file:mr-4 file:rounded-lg file:border-0 file:bg-teal-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-teal-800 dark:file:bg-teal-500 dark:hover:file:bg-teal-400`}
            />
            {verifyDocument ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-white/55">
                Selected file: {verifyDocument.name}
              </p>
            ) : null}
          </Field>

          {message ? (
            <p className="exp-card px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="exp-primary-button px-4 py-2.5"
          >
            {loading ? "Submitting..." : "Submit for verification"}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="exp-secondary-button px-4 py-2.5"
          >
            Sign out
          </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

const inputClassName =
  "exp-input";

function Field({ label, hint, children }) {
  return (
    <div className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium">
        <span>{label}</span>
        {hint ? (
          <span className="text-xs font-normal text-slate-500 dark:text-white/45">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

function DropdownSelect({
  value,
  onChange,
  options,
  placeholder,
  groupLabel,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption =
    options.find((option) => option.value === value) || null;

  useEffect(() => {
    function handlePointerDown(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="student-select-trigger"
      >
        <span>{selectedOption?.label || placeholder}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div className="student-select-menu top-full mt-3">
          <div
            className="max-h-72 space-y-2 overflow-y-auto pr-1"
            role="listbox"
          >
            <p className="student-select-group">{groupLabel}</p>
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`student-select-option ${
                    isSelected ? "is-selected" : ""
                  }`}
                >
                  <span className="student-select-badge">{option.badge}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-white/55">
                      {option.description}
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

function ChevronIcon({ open }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-6 w-6 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 4V2.5M12 21.5V20M20 12H21.5M2.5 12H4M17.657 6.343L18.718 5.282M5.282 18.718L6.343 17.657M17.657 17.657L18.718 18.718M5.282 5.282L6.343 6.343M16 12A4 4 0 1 1 8 12A4 4 0 0 1 16 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18.8 15.6A7.8 7.8 0 0 1 8.4 5.2A7.9 7.9 0 1 0 18.8 15.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isValidUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
