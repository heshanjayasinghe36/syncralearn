import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Mail,
  Moon,
  Save,
  Settings,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";
import {
  VARK_OPTIONS,
  VARK_OPTION_GROUPS,
  getCanonicalVarkValue,
  getVarkResultLabel,
} from "../../lib/vark";

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

const EMPTY_READONLY_VALUE = "Not provided";

export default function TeacherSettingsPage({
  session,
  teacherProfile,
  onProfileUpdate,
  theme = "light",
  onToggleTheme,
}) {
  const [fullName, setFullName] = useState(teacherProfile?.full_name || "");
  const academicQualification = teacherProfile?.academic_qualification || "";
  const fieldOfStudy = teacherProfile?.field_of_study || "";
  const institutionName = teacherProfile?.institution_name || "";
  const staffOrStudentId = teacherProfile?.staff_or_student_id || "";
  const [linkedinUrl, setLinkedinUrl] = useState(
    teacherProfile?.linkedin_url || ""
  );
  const [githubUrl, setGithubUrl] = useState(teacherProfile?.github_url || "");
  const [selectedTeachingStyle, setSelectedTeachingStyle] = useState(
    getValidVarkOptionValue(teacherProfile?.mts || "")
  );
  const [teachingStyleMenuOpen, setTeachingStyleMenuOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTeachingStyle, setSavingTeachingStyle] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [teachingStyleMessage, setTeachingStyleMessage] = useState("");
  const teachingStyleDropdownRef = useRef(null);
  const email = teacherProfile?.email || session?.user?.email || "Not available";
  const selectedQualification =
    ACADEMIC_QUALIFICATIONS.find(
      (option) => option.value === academicQualification
    ) || null;
  const selectedField =
    FIELD_OF_STUDY_OPTIONS.find((option) => option.value === fieldOfStudy) ||
    null;
  const selectedTeachingStyleOption =
    VARK_OPTIONS.find((option) => option.value === selectedTeachingStyle) ||
    null;
  const isBusy = savingProfile || savingTeachingStyle;

  useEffect(() => {
    function handlePointerDown(event) {
      if (!teachingStyleDropdownRef.current?.contains(event.target)) {
        setTeachingStyleMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  async function handleSaveProfile(event) {
    event.preventDefault();

    if (!supabase) {
      setProfileMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    if (!teacherProfile?.tid && !session?.user?.id) {
      setProfileMessage("Teacher profile ID was not found.");
      return;
    }

    const cleanFullName = fullName.trim();
    const cleanLinkedinUrl = linkedinUrl.trim();
    const cleanGithubUrl = githubUrl.trim();

    if (!cleanFullName) {
      setProfileMessage("Full name is required.");
      return;
    }

    const linkedinOk =
      cleanLinkedinUrl.length === 0 || isValidUrl(cleanLinkedinUrl);
    const githubOk = cleanGithubUrl.length === 0 || isValidUrl(cleanGithubUrl);

    if (!linkedinOk) {
      setProfileMessage("LinkedIn URL is not valid.");
      return;
    }

    if (!githubOk) {
      setProfileMessage("GitHub URL is not valid.");
      return;
    }

    setSavingProfile(true);
    setProfileMessage("");

    let query = supabase
      .from("teacher")
      .update({
        full_name: cleanFullName,
        linkedin_url: cleanLinkedinUrl || null,
        github_url: cleanGithubUrl || null,
      })
      .select("*");

    query = teacherProfile?.tid
      ? query.eq("tid", teacherProfile.tid)
      : query.eq("auth_user_id", session.user.id);

    const { data, error } = await query.maybeSingle();

    if (error) {
      setProfileMessage(`Profile update failed: ${error.message}`);
      setSavingProfile(false);
      return;
    }

    onProfileUpdate?.(data || {
      ...teacherProfile,
      full_name: cleanFullName,
      linkedin_url: cleanLinkedinUrl || null,
      github_url: cleanGithubUrl || null,
    });
    setProfileMessage("Profile saved.");
    setSavingProfile(false);
  }

  async function handleSaveTeachingStyle(event) {
    event.preventDefault();

    if (!supabase) {
      setTeachingStyleMessage(
        supabaseConfigError || "Supabase is not configured."
      );
      return;
    }

    if (!teacherProfile?.tid && !session?.user?.id) {
      setTeachingStyleMessage("Teacher profile ID was not found.");
      return;
    }

    if (!selectedTeachingStyle) {
      setTeachingStyleMessage("Select your teaching style first.");
      return;
    }

    const canonicalTeachingStyle = getCanonicalVarkValue(selectedTeachingStyle);

    setSavingTeachingStyle(true);
    setTeachingStyleMessage("");

    let query = supabase
      .from("teacher")
      .update({
        mts: canonicalTeachingStyle,
      })
      .select("*");

    query = teacherProfile?.tid
      ? query.eq("tid", teacherProfile.tid)
      : query.eq("auth_user_id", session.user.id);

    const { data, error } = await query.maybeSingle();

    if (error) {
      setTeachingStyleMessage(`Teaching style update failed: ${error.message}`);
      setSavingTeachingStyle(false);
      return;
    }

    onProfileUpdate?.(data || {
      ...teacherProfile,
      mts: canonicalTeachingStyle,
    });
    setSelectedTeachingStyle(canonicalTeachingStyle);
    setTeachingStyleMessage("Teaching style saved.");
    setSavingTeachingStyle(false);
  }

  return (
    <section
      className="student-settings-page teacher-settings-page"
      aria-label="Teacher settings"
    >
      <div className="student-settings-header">
        <h2>Settings</h2>
      </div>

      <div className="student-settings-grid">
        <form className="student-settings-card" onSubmit={handleSaveProfile}>
          <div className="student-settings-card-heading">
            <span>
              <UserRound aria-hidden="true" />
            </span>
            <div>
              <p>Profile</p>
              <h3>Professional details</h3>
            </div>
          </div>

          <div className="student-settings-profile-fields">
            <label className="student-settings-field">
              <span>Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  setProfileMessage("");
                }}
                placeholder="Your name"
                disabled={isBusy}
              />
            </label>

            <label className="student-settings-field">
              <span>Email</span>
              <div className="student-settings-readonly">
                <Mail aria-hidden="true" />
                <input type="email" value={email} readOnly />
              </div>
            </label>

            <label className="student-settings-field">
              <span>Academic qualification</span>
              <div className="student-settings-readonly">
                <input
                  type="text"
                  value={selectedQualification?.label || academicQualification || EMPTY_READONLY_VALUE}
                  readOnly
                />
              </div>
            </label>

            <label className="student-settings-field">
              <span>Field of study</span>
              <div className="student-settings-readonly">
                <input
                  type="text"
                  value={selectedField?.label || fieldOfStudy || EMPTY_READONLY_VALUE}
                  readOnly
                />
              </div>
            </label>

            <label className="student-settings-field">
              <span>Institution name</span>
              <div className="student-settings-readonly">
                <input
                  type="text"
                  value={institutionName || EMPTY_READONLY_VALUE}
                  readOnly
                />
              </div>
            </label>

            <label className="student-settings-field">
              <span>Staff/Student ID</span>
              <div className="student-settings-readonly">
                <input
                  type="text"
                  value={staffOrStudentId || EMPTY_READONLY_VALUE}
                  readOnly
                />
              </div>
            </label>

            <label className="student-settings-field">
              <span>LinkedIn URL</span>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(event) => {
                  setLinkedinUrl(event.target.value);
                  setProfileMessage("");
                }}
                placeholder="https://linkedin.com/in/yourprofile"
                disabled={isBusy}
              />
            </label>

            <label className="student-settings-field">
              <span>GitHub URL</span>
              <input
                type="url"
                value={githubUrl}
                onChange={(event) => {
                  setGithubUrl(event.target.value);
                  setProfileMessage("");
                }}
                placeholder="https://github.com/yourusername"
                disabled={isBusy}
              />
            </label>
          </div>

          {profileMessage ? (
            <p className="student-settings-message">{profileMessage}</p>
          ) : null}

          <button type="submit" disabled={isBusy}>
            <Save aria-hidden="true" />
            <span>{savingProfile ? "Saving..." : "Save Changes"}</span>
          </button>
        </form>

        <form
          className="student-settings-card student-settings-summary"
          onSubmit={handleSaveTeachingStyle}
        >
          <div className="student-settings-card-heading">
            <span>
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <p>Teaching profile</p>
              <h3>My teaching style</h3>
            </div>
          </div>

          <div className="student-settings-learning-row">
            <label className="student-settings-field student-settings-learning-field">
              <span>Teaching style</span>
              <div
                className="student-settings-select"
                ref={teachingStyleDropdownRef}
              >
                <button
                  type="button"
                  className="student-select-trigger"
                  onClick={() => setTeachingStyleMenuOpen((open) => !open)}
                  disabled={isBusy}
                  aria-expanded={teachingStyleMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span>
                    {selectedTeachingStyleOption?.label ||
                      formatTeachingStyle(selectedTeachingStyle) ||
                      "Select your teaching style..."}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={teachingStyleMenuOpen ? "is-open" : ""}
                  />
                </button>

                {teachingStyleMenuOpen ? (
                  <div className="student-select-menu student-settings-select-menu">
                    <div className="student-settings-select-scroll" role="listbox">
                      {VARK_OPTION_GROUPS.map((group) => (
                        <div
                          key={group.title}
                          className="student-settings-option-group"
                        >
                          <p className="student-select-group">{group.title}</p>
                          {group.options.map((option) => {
                            const isSelected =
                              option.value === selectedTeachingStyle;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setSelectedTeachingStyle(option.value);
                                  setTeachingStyleMenuOpen(false);
                                  setTeachingStyleMessage("");
                                }}
                                className={`student-select-option ${
                                  isSelected ? "is-selected" : ""
                                }`}
                              >
                                <span className="student-select-badge">
                                  {option.badge}
                                </span>
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
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </label>

            <div className="student-settings-learning-actions">
              <button type="submit" disabled={isBusy}>
                <Save aria-hidden="true" />
                <span>
                  {savingTeachingStyle ? "Saving..." : "Save Teaching Style"}
                </span>
              </button>
            </div>
          </div>

          {teachingStyleMessage ? (
            <p className="student-settings-message">{teachingStyleMessage}</p>
          ) : null}
        </form>

        <section className="student-settings-card student-settings-preferences-card">
          <div className="student-settings-card-heading">
            <span>
              <Settings aria-hidden="true" />
            </span>
            <div>
              <p>Preferences</p>
              <h3>Appearance</h3>
            </div>
          </div>

          <div className="student-settings-preference-row">
            <div>
              <h4>Theme mode</h4>
              <p>Switch between the light and dark Syncra Learn interface.</p>
            </div>

            <button
              type="button"
              className="student-settings-theme-toggle"
              onClick={onToggleTheme}
              disabled={!onToggleTheme}
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              <span className={theme === "light" ? "is-active" : ""}>
                <Sun aria-hidden="true" />
              </span>
              <span className={theme === "dark" ? "is-active" : ""}>
                <Moon aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

function getValidVarkOptionValue(value) {
  const canonicalValue = getCanonicalVarkValue(value);

  return VARK_OPTIONS.some((option) => option.value === canonicalValue)
    ? canonicalValue
    : "";
}

function formatTeachingStyle(value) {
  if (!value) {
    return "";
  }

  return getVarkResultLabel(value);
}
