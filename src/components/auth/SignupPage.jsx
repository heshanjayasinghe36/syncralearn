import { useMemo, useState } from "react";
import {
  continueWithGoogle,
  supabase,
  supabaseConfigError,
} from "../../lib/supabase";

export default function SignupPage({
  notice,
  onSignIn,
  theme = "light",
  onToggleTheme,
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState(false);
  const [message, setMessage] = useState("");

  const passwordMatch = pw === confirmPw;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const nameOk = fullName.trim().length >= 3;
  const pwOk = pw.trim().length >= 6;

  const canSubmit = useMemo(() => {
    return nameOk && emailOk && pwOk && passwordMatch && !loading;
  }, [nameOk, emailOk, pwOk, passwordMatch, loading]);

  async function handleGoogleAuth() {
    setMessage("");
    setOAuthLoading(true);

    try {
      const { error } = await continueWithGoogle({ role, mode: "signup" });

      if (error) {
        setMessage(error.message);
      }
    } catch (err) {
      setMessage(err.message || "Google sign-in failed.");
    } finally {
      setOAuthLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pw,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        setMessage("Account created successfully. Redirecting...");
      } else {
        setMessage(
          "Account created. Please check your email to confirm your account, then sign in to finish setup."
        );
      }

      setFullName("");
      setEmail("");
      setPw("");
      setConfirmPw("");
      setRole("student");
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="exp-shell exp-auth-page">
      <AuthNav
        theme={theme}
        onSignIn={onSignIn}
        onToggleTheme={onToggleTheme}
      />

      <main className="exp-auth-main">
        <section className="exp-auth-hero">
          <div className="exp-auth-copy">
            <h1>Start bright, stay curious.</h1>
            <p>
              Create a learning profile that feels soft, focused, and ready for
              your next skill.
            </p>
          </div>
          <HeroArt />
        </section>

        <section className="exp-frame exp-auth-card">
          <h2>Create Account</h2>
          <p className="exp-auth-card-subtitle">
            Choose your role and join Syncra Learn.
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <SocialButton
              label={oauthLoading ? "Connecting to Google..." : "Google"}
              icon={<GoogleLogo />}
              onClick={handleGoogleAuth}
              disabled={oauthLoading}
            />

            <div className="exp-divider py-1">
              <span>or use email</span>
            </div>

            <Field label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                type="text"
                placeholder="Heshan Jayasinghe"
                className="exp-input"
              />
            </Field>

            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                className="exp-input"
              />
            </Field>

            <Field label="Role">
              <div className="grid grid-cols-2 gap-3">
                <RoleButton
                  active={role === "student"}
                  onClick={() => setRole("student")}
                  label="Student"
                  icon="🎓"
                />
                <RoleButton
                  active={role === "lecturer"}
                  onClick={() => setRole("lecturer")}
                  label="Lecturer"
                  icon="🧑‍🏫"
                />
              </div>
            </Field>

            <Field label="Password">
              <PasswordInput
                value={pw}
                onChange={setPw}
                show={showPw}
                onToggle={() => setShowPw((s) => !s)}
                autoComplete="new-password"
              />
            </Field>

            <Field label="Confirm password">
              <PasswordInput
                value={confirmPw}
                onChange={setConfirmPw}
                show={showConfirmPw}
                onToggle={() => setShowConfirmPw((s) => !s)}
                autoComplete="new-password"
                invalid={confirmPw.length > 0 && !passwordMatch}
              />
            </Field>

            {confirmPw.length > 0 && !passwordMatch ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">
                Passwords do not match.
              </p>
            ) : null}

            {notice ? (
              <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-400/10 dark:text-teal-100">
                {notice}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="exp-primary-button mt-1 w-full px-4 py-2.5 text-sm"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            <p className="text-center text-sm font-semibold text-slate-700 dark:text-white/70">
              Already have an account?{" "}
              <button
                type="button"
                className="text-[#77507a] hover:text-[#5f3f62] dark:text-[#dfbddf]"
                onClick={() => onSignIn?.()}
              >
                Sign in
              </button>
            </p>
          </form>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

function AuthNav({ theme, onSignIn, onToggleTheme }) {
  return (
    <header className="exp-auth-nav">
      <div className="exp-auth-brand">Syncra Learn</div>
      <div className="exp-auth-actions">
        <button type="button" className="exp-auth-cta" onClick={onSignIn}>
          Login
        </button>
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
  );
}

function HeroArt() {
  return (
    <div className="exp-art-card">
      <img
        src="/authHero.png"
        alt="Cute learning illustration"
        className="exp-art-image"
      />
      <div className="exp-art-book" />
      <div className="exp-art-sphere" />
      <div className="exp-art-dot one" />
      <div className="exp-art-dot two" />
      <div className="exp-art-dot three" />
      <div className="exp-art-star">✦</div>
      <div className="exp-art-chip">Learn more</div>
    </div>
  );
}

function AuthFooter() {
  return (
    <footer className="exp-auth-footer">
      <div className="exp-auth-footer-inner">
        <span>© 2026 Syncra Learn. Built for lifelong learners.</span>
        <div className="exp-auth-footer-links">
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Contact Support</span>
        </div>
      </div>
    </footer>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800 dark:text-white/80">
        {label}
      </span>
      {children}
    </label>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  invalid = false,
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={show ? "text" : "password"}
        placeholder="••••••••"
        autoComplete={autoComplete}
        className={`exp-input pr-16 ${invalid ? "border-rose-300" : ""}`}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 hover:text-teal-700 dark:text-white/50 dark:hover:text-teal-200"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function RoleButton({ active, onClick, label, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`exp-secondary-button px-4 py-2 text-sm ${
        active
          ? "border-teal-500 bg-teal-50 text-teal-800 shadow-none dark:border-teal-300 dark:bg-teal-300/10 dark:text-teal-100"
          : "text-slate-700 dark:text-white/75"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SocialButton({ label, icon, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="exp-secondary-button w-full px-4 py-2 text-sm"
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.805 12.23c0-.68-.061-1.333-.174-1.96H12v3.709h5.498a4.703 4.703 0 0 1-2.04 3.086v2.563h3.305c1.935-1.781 3.042-4.406 3.042-7.398Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.074-.914 6.765-2.474l-3.305-2.563c-.914.612-2.084.974-3.46.974-2.658 0-4.91-1.795-5.715-4.209H2.868v2.644A9.997 9.997 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.285 13.728A5.996 5.996 0 0 1 5.965 12c0-.6.109-1.18.32-1.728V7.628H2.868A10 10 0 0 0 2 12c0 1.613.387 3.141 1.074 4.372l3.211-2.644Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.062c1.5 0 2.847.516 3.907 1.529l2.93-2.93C17.07 3.019 14.757 2 12 2A9.997 9.997 0 0 0 2.868 7.628l3.417 2.644C7.09 7.857 9.342 6.062 12 6.062Z"
        fill="#EA4335"
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
