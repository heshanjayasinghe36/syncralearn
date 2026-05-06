import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { VARK_OPTIONS, VARK_OPTION_GROUPS } from "../../lib/vark";

export default function StudentOnboarding({
  session,
  theme = "light",
  onToggleTheme,
  onCompleted,
  onSignOut,
}) {
  const [selected, setSelected] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState("bottom");
  const [menuMaxHeight, setMenuMaxHeight] = useState(320);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const dropdownRef = useRef(null);
  const selectedOption =
    VARK_OPTIONS.find((option) => option.value === selected) || null;

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

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function updateMenuLayout() {
      const dropdown = dropdownRef.current;

      if (!dropdown) {
        return;
      }

      const rect = dropdown.getBoundingClientRect();
      const viewportPadding = 16;
      const estimatedMenuHeight = 360;
      const spaceAbove = rect.top - viewportPadding;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const placeAbove =
        spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
      const availableSpace = placeAbove ? spaceAbove : spaceBelow;

      setMenuPlacement(placeAbove ? "top" : "bottom");
      setMenuMaxHeight(
        Math.max(Math.min(availableSpace, estimatedMenuHeight), 180)
      );
    }

    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);

    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
    };
  }, [menuOpen]);

  async function handleContinue() {
    if (!selected) {
      setMessage("Please select your VARK result first.");
      return;
    }

    if (!session?.user?.id) {
      setMessage("No authenticated user found.");
      return;
    }

    setLoading(true);
    setMessage("");

    const userId = session.user.id;

    const { error } = await supabase
      .from("student")
      .upsert(
        {
          auth_user_id: userId,
          full_name:
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.email?.split("@")[0] ||
            "Student",
          email: session.user.email,
          mls: selected,
          vark_completed: true,
          vark_completed_at: new Date().toISOString(),
        },
        { onConflict: "auth_user_id" }
      );

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await onCompleted?.();
    setLoading(false);
  }

  return (
    <div className="exp-shell student-onboarding-page">
      <header className="student-onboarding-nav">
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

      <main className="student-onboarding-main">
        <section className="student-onboarding-card">
          <div className="student-onboarding-inner">
            <div className="student-onboarding-icon">
              <BrainIcon />
            </div>

            <h1>Discover Your Learning Style</h1>
            <p className="student-onboarding-copy">
              The VARK questionnaire helps you understand how you process
              information best. Whether you are a visual mapper or a social
              listener, we will adapt your journey to match.
            </p>

            <a
              href="https://vark-learn.com/the-vark-questionnaire/"
              target="_blank"
              rel="noreferrer"
              className="student-questionnaire-button"
            >
              <ExternalIcon />
              <span>Open Questionnaire</span>
            </a>

            <p className="student-questionnaire-note">
              Takes approximately 5-10 minutes to complete.
            </p>

            <div className="student-onboarding-divider">
              <span>After finishing, select your learning preference</span>
            </div>

            <div className="student-manual-section">
              {/* <label className="student-manual-label">
                Already know your style?
              </label> */}

              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  disabled={loading}
                  aria-expanded={menuOpen}
                  aria-haspopup="listbox"
                  className="student-select-trigger"
                >
                  <span>
                    {selectedOption?.label || "Select your VARK result..."}
                  </span>
                  <ChevronIcon open={menuOpen} />
                </button>

                {menuOpen ? (
                  <div
                    className={`student-select-menu ${
                      menuPlacement === "top"
                        ? "bottom-full mb-3"
                        : "top-full mt-3"
                    }`}
                  >
                    <div
                      className="space-y-2 overflow-y-auto pr-1"
                      role="listbox"
                      style={{ maxHeight: `${menuMaxHeight}px` }}
                    >
                      {VARK_OPTION_GROUPS.map((group) => (
                        <div key={group.title} className="space-y-2">
                          <p className="student-select-group">{group.title}</p>
                          {group.options.map((option) => {
                            const isSelected = option.value === selected;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setSelected(option.value);
                                  setMenuOpen(false);
                                  setMessage("");
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
            </div>

            {message ? (
              <p className="student-onboarding-message">{message}</p>
            ) : null}

            <div className="student-onboarding-actions">
              <button
                type="button"
                onClick={onSignOut}
                className="student-secondary-action"
              >
                Sign out
              </button>

              <button
                type="button"
                onClick={handleContinue}
                disabled={loading}
                className="student-primary-action"
              >
                {loading ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        </section>

        <section className="student-benefits" aria-label="Learning benefits">
          <BenefitCard
            icon={<MaterialIcon />}
            title="Personalized Material"
            text="Content formats change based on your profile."
            tone="warm"
          />
          <BenefitCard
            icon={<PaceIcon />}
            title="Adaptive Pace"
            text="The platform learns when you need extra review."
            tone="green"
          />
          <BenefitCard
            icon={<SparkIcon />}
            title="AI Insights"
            text="Get deep analytics on your cognitive strengths."
            tone="purple"
          />
        </section>
      </main>
    </div>
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

function BenefitCard({ icon, title, text, tone }) {
  return (
    <article className={`student-benefit-card ${tone}`}>
      <div className="student-benefit-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function BrainIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-8"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.5 19.5v-4.25H8.25a4.75 4.75 0 0 1 0-9.5H9.5M14.5 19.5v-3.25h1.25a4.75 4.75 0 0 0 0-9.5H14.5M9.5 5.75A3.25 3.25 0 0 1 12 4.5a3.25 3.25 0 0 1 2.5 1.25M9.5 15.25V5.75M14.5 16.25V5.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.75 10.25h2.5M12 9v2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16h8a1.5 1.5 0 0 0 1.5-1.5V12M10.5 4H16v5.5M15.5 4.5 9 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function MaterialIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 18h8M9 15.5h6M12 3.5a5.5 5.5 0 0 0-3.25 9.94V16h6.5v-2.56A5.5 5.5 0 0 0 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaceIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 19.5a7.5 7.5 0 1 0-7.5-7.5M12 19.5a7.5 7.5 0 0 1-7.5-7.5M12 19.5v-3M12 12l4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m12 3 1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2-3.3-1.3 3.3-1.3L12 3ZM17.5 12l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM7 13l.9 2.6 2.6.9-2.6.9L7 20l-.9-2.6-2.6-.9 2.6-.9L7 13Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
