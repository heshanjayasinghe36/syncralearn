import { useMemo, useState } from "react";
import {
  continueWithGoogle,
  signInWithEmail,
  supabase,
  supabaseConfigError,
} from "../../lib/supabase";

export default function LoginPage({
  notice,
  onAdminLogin,
  onCreateAccount,
  theme = "light",
  onToggleTheme,
}) {
  const [identifier, setIdentifier] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState("");

  const identifierValue = identifier.trim();
  const emailLogin = /^\S+@\S+\.\S+$/.test(identifierValue);
  const adminLogin =
    identifierValue.length >= 3 && !identifierValue.includes("@");

  const canSubmit = useMemo(() => {
    const pwOk = pw.trim().length >= 6;
    return (emailLogin || adminLogin) && pwOk && !loading;
  }, [adminLogin, emailLogin, pw, loading]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!canSubmit) {
      return;
    }

    setMessage("");
    setLoading(true);

    try {
      if (adminLogin) {
        const adminResult = onAdminLogin
          ? await onAdminLogin(identifierValue, pw)
          : { error: new Error("Admin sign-in is unavailable.") };

        if (adminResult.error) {
          setMessage(adminResult.error.message);
        }

        return;
      }

      if (!emailLogin) {
        setMessage("Enter a valid email address or an admin username.");
        return;
      }

      const { error } = await signInWithEmail(identifierValue, pw);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!remember) {
        setMessage(
          "Signed in. This session will still follow your browser settings."
        );
      }
    } catch (err) {
      setMessage(err.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setMessage("");
    setOAuthLoading(true);

    try {
      const { error } = await continueWithGoogle({ mode: "login" });

      if (error) {
        setMessage(error.message);
      }
    } catch (err) {
      setMessage(err.message || "Google sign-in failed.");
    } finally {
      setOAuthLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (!emailLogin) {
      setMessage("Enter your email address to reset your password.");
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    setResetLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(
      identifierValue,
      {
        redirectTo:
          typeof window === "undefined" ? undefined : window.location.origin,
      }
    );

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password reset link sent.");
    }

    setResetLoading(false);
  }

  return (
    <div className="exp-shell exp-auth-page">
      <AuthNav
        theme={theme}
        onSignUp={onCreateAccount}
        onToggleTheme={onToggleTheme}
      />

      <main className="exp-auth-main">
        <section className="exp-auth-hero">
          <div className="exp-auth-copy">
            <h1>Learn at your pace.</h1>
            <p>
              Continue your courses, track progress, and keep your study plan
              in one place.
            </p>
          </div>
          <HeroArt />
        </section>

        <section className="exp-frame exp-auth-card">
          <h2>Welcome back</h2>
          <p className="exp-auth-card-subtitle">
            Sign in to continue.
          </p>

          <form className="mt-4 space-y-3.5" onSubmit={handleSubmit}>
            <SocialButton
              label={oauthLoading ? "Connecting to Google..." : "Google"}
              icon={<GoogleLogo />}
              onClick={handleGoogleAuth}
              disabled={oauthLoading}
            />

            <div className="exp-divider py-1">
              <span>or use email</span>
            </div>

            <Field label="Email or Username">
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                type="text"
                placeholder="name@example.com"
                autoComplete="email"
                className="exp-input"
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder="********"
                  autoComplete="current-password"
                  className="exp-input pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 hover:text-teal-700 dark:text-white/50 dark:hover:text-teal-200"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700 dark:text-white/70">
                <input
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  type="checkbox"
                className="h-3.5 w-3.5 rounded-full border-0 bg-slate-200 text-teal-700 focus:ring-teal-200"
                />
                Remember me
              </label>

              <button
                type="button"
                className="text-sm font-semibold text-emerald-800 hover:text-emerald-700 dark:text-teal-200"
                onClick={handlePasswordReset}
                disabled={resetLoading || loading}
              >
                {resetLoading ? "Sending..." : "Forgot password?"}
              </button>
            </div>

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
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="text-center text-sm font-semibold text-slate-700 dark:text-white/70">
              New to Syncra Learn?{" "}
              <button
                type="button"
                className="text-[#77507a] hover:text-[#5f3f62] dark:text-[#dfbddf]"
                onClick={() => onCreateAccount?.()}
              >
                Create an account
              </button>
            </p>
          </form>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

function AuthNav({ theme, onSignUp, onToggleTheme }) {
  return (
    <header className="exp-auth-nav">
      <div className="exp-auth-brand">Syncra Learn</div>
      <div className="exp-auth-actions">
        <button type="button" className="exp-auth-cta" onClick={onSignUp}>
          Sign Up
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
        src="/authHeroO.png"
        alt="Cute learning illustration"
        className="exp-art-image"
      />
      <div className="exp-art-book" />
      <div className="exp-art-sphere" />
      <div className="exp-art-dot one" />
      <div className="exp-art-dot two" />
      <div className="exp-art-dot three" />
      <div className="exp-art-star">*</div>
      <div className="exp-art-chip">Study</div>
    </div>
  );
}

function AuthFooter() {
  return (
    <footer className="exp-auth-footer">
      <div className="exp-auth-footer-inner">
        <span>{"\u00A9"} 2026 Syncra Learn. Built for lifelong learners.</span>
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
