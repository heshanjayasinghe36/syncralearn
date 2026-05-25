import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Mail,
  Moon,
  RotateCcw,
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

export default function StudentSettingsPage({
  session,
  studentProfile,
  onProfileUpdate,
  theme = "light",
  onToggleTheme,
}) {
  const [fullName, setFullName] = useState(studentProfile?.full_name || "");
  const [dob, setDob] = useState(studentProfile?.dob || "");
  const [selectedLearningStyle, setSelectedLearningStyle] = useState(
    getCanonicalVarkValue(studentProfile?.mls || "")
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLearningStyle, setSavingLearningStyle] = useState(false);
  const [retakingTest, setRetakingTest] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [learningMessage, setLearningMessage] = useState("");
  const dropdownRef = useRef(null);
  const email = studentProfile?.email || session?.user?.email || "Not available";
  const selectedOption =
    VARK_OPTIONS.find((option) => option.value === selectedLearningStyle) ||
    null;
  const isBusy = savingProfile || savingLearningStyle || retakingTest;

  useEffect(() => {
    function handlePointerDown(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setMenuOpen(false);
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

    if (!studentProfile?.sid && !session?.user?.id) {
      setProfileMessage("Student profile ID was not found.");
      return;
    }

    const cleanFullName = fullName.trim();

    if (!cleanFullName) {
      setProfileMessage("Full name is required.");
      return;
    }

    setSavingProfile(true);
    setProfileMessage("");

    let query = supabase
      .from("student")
      .update({
        full_name: cleanFullName,
        dob: dob || null,
      })
      .select("*");

    query = studentProfile?.sid
      ? query.eq("sid", studentProfile.sid)
      : query.eq("auth_user_id", session.user.id);

    const { data, error } = await query.maybeSingle();

    if (error) {
      setProfileMessage(`Profile update failed: ${error.message}`);
      setSavingProfile(false);
      return;
    }

    onProfileUpdate?.(data || {
      ...studentProfile,
      full_name: cleanFullName,
      dob: dob || null,
    });
    setProfileMessage("Profile saved.");
    setSavingProfile(false);
  }

  async function handleSaveLearningStyle(event) {
    event.preventDefault();

    if (!supabase) {
      setLearningMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    if (!studentProfile?.sid && !session?.user?.id) {
      setLearningMessage("Student profile ID was not found.");
      return;
    }

    if (!selectedLearningStyle) {
      setLearningMessage("Select your learning style first.");
      return;
    }

    const canonicalLearningStyle = getCanonicalVarkValue(selectedLearningStyle);

    setSavingLearningStyle(true);
    setLearningMessage("");

    let query = supabase
      .from("student")
      .update({
        mls: canonicalLearningStyle,
        vark_completed: true,
        vark_completed_at: new Date().toISOString(),
      })
      .select("*");

    query = studentProfile?.sid
      ? query.eq("sid", studentProfile.sid)
      : query.eq("auth_user_id", session.user.id);

    const { data, error } = await query.maybeSingle();

    if (error) {
      setLearningMessage(`Learning style update failed: ${error.message}`);
      setSavingLearningStyle(false);
      return;
    }

    onProfileUpdate?.(data || {
      ...studentProfile,
      mls: canonicalLearningStyle,
      vark_completed: true,
      vark_completed_at: new Date().toISOString(),
    });
    setSelectedLearningStyle(canonicalLearningStyle);
    setLearningMessage("Learning style saved.");
    setSavingLearningStyle(false);
  }

  async function handleRetakeTest() {
    if (!supabase) {
      setLearningMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    if (!studentProfile?.sid && !session?.user?.id) {
      setLearningMessage("Student profile ID was not found.");
      return;
    }

    setRetakingTest(true);
    setLearningMessage("");

    let query = supabase
      .from("student")
      .update({
        vark_completed: false,
        vark_completed_at: null,
      })
      .select("*");

    query = studentProfile?.sid
      ? query.eq("sid", studentProfile.sid)
      : query.eq("auth_user_id", session.user.id);

    const { data, error } = await query.maybeSingle();

    if (error) {
      setLearningMessage(`Retake setup failed: ${error.message}`);
      setRetakingTest(false);
      return;
    }

    onProfileUpdate?.(data || {
      ...studentProfile,
      vark_completed: false,
      vark_completed_at: null,
    });
    setRetakingTest(false);
  }

  return (
    <section className="student-settings-page" aria-label="Student settings">
      <div className="student-settings-header">
        {/* <span>
          <Settings aria-hidden="true" />
          Settings
        </span> */}
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
              <h3>Personal details</h3>
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
              <span>Date of birth</span>
              <input
                type="date"
                value={dob || ""}
                onChange={(event) => {
                  setDob(event.target.value);
                  setProfileMessage("");
                }}
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
          onSubmit={handleSaveLearningStyle}
        >
          <div className="student-settings-card-heading">
            <span>
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <p>Learning profile</p>
              <h3>Your course matching</h3>
            </div>
          </div>

          <div className="student-settings-learning-row">
            <label className="student-settings-field student-settings-learning-field">
              <span>Learning style</span>
              <div className="student-settings-select" ref={dropdownRef}>
                <button
                  type="button"
                  className="student-select-trigger"
                  onClick={() => setMenuOpen((open) => !open)}
                  disabled={isBusy}
                  aria-expanded={menuOpen}
                  aria-haspopup="listbox"
                >
                  <span>
                    {selectedOption?.label ||
                      formatLearningStyle(selectedLearningStyle) ||
                      "Select VARK result"}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={menuOpen ? "is-open" : ""}
                  />
                </button>

                {menuOpen ? (
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
                              option.value === selectedLearningStyle;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setSelectedLearningStyle(option.value);
                                  setMenuOpen(false);
                                  setLearningMessage("");
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
                  {savingLearningStyle ? "Saving..." : "Save Learning Style"}
                </span>
              </button>

              <button
                type="button"
                className="student-settings-secondary-button"
                onClick={handleRetakeTest}
                disabled={isBusy}
              >
                <RotateCcw aria-hidden="true" />
                <span>{retakingTest ? "Opening..." : "Retake the Test"}</span>
              </button>
            </div>
          </div>

          {learningMessage ? (
            <p className="student-settings-message">{learningMessage}</p>
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

function formatLearningStyle(value) {
  if (!value) {
    return "";
  }

  return getVarkResultLabel(value);
}
