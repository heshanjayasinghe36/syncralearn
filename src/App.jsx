import { useEffect, useState } from "react";
import { AdminDashboard } from "./components/admin";
import { LoginPage, SignupPage } from "./components/auth";
import { StudentOnboarding, TeacherOnboarding } from "./components/onboarding";
import { StudentDashboard } from "./components/student";
import { TeacherDashboard } from "./components/teacher";
import {
  clearStoredAdminSession,
  clearPendingOAuthMode,
  clearPendingOAuthRole,
  getStoredAdminSession,
  getPendingOAuthMode,
  getPendingOAuthRole,
  signInAsAdmin,
  signOutUser,
  storeAdminSession,
  supabase,
} from "./lib/supabase";

export default function App() {
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "light"
  );
  const [page, setPage] = useState("login");
  const [adminSession, setAdminSession] = useState(() => getStoredAdminSession());
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(() => Boolean(supabase));
  const [profileLoading, setProfileLoading] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [authNotice, setAuthNotice] = useState("");
  const sessionUserId = session?.user?.id || null;
  const sessionUserRole = session?.user?.user_metadata?.role || null;
  const sessionUserEmail = session?.user?.email || null;
  const sessionUserFullName = session?.user?.user_metadata?.full_name || null;
  const sessionUserName = session?.user?.user_metadata?.name || null;

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    let isActive = true;

    if (!supabase) {
      return undefined;
    }

    async function loadSession() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      setSession(currentSession);
      if (!currentSession) {
        setUserRole(null);
        setStudentProfile(null);
        setTeacherProfile(null);
      }
      setAuthLoading(false);
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) {
        return;
      }

      setSession(nextSession);
      if (!nextSession) {
        setUserRole(null);
        setStudentProfile(null);
        setTeacherProfile(null);
      }
      setAuthLoading(false);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionUserId || !supabase) {
      return;
    }

    async function loadProfile() {
      setProfileLoading(true);

      const userId = sessionUserId;

      const { data: studentData, error: studentError } = await supabase
        .from("student")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (!studentError && studentData) {
        clearPendingOAuthMode();
        clearPendingOAuthRole();
        setAuthNotice("");
        setUserRole("student");
        setStudentProfile(studentData);
        setTeacherProfile(null);
        setProfileLoading(false);
        return;
      }

      const { data: teacherData, error: teacherError } = await supabase
        .from("teacher")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (!teacherError && teacherData) {
        clearPendingOAuthMode();
        clearPendingOAuthRole();
        setAuthNotice("");
        setUserRole("lecturer");
        setStudentProfile(null);
        setTeacherProfile(teacherData);
        setProfileLoading(false);
        return;
      }

      const pendingOAuthMode = getPendingOAuthMode();
      const pendingOAuthRole = getPendingOAuthRole();
      const fallbackRole = sessionUserRole || pendingOAuthRole;

      if (fallbackRole === "student") {
        if (!sessionUserRole && pendingOAuthRole) {
          const { error: metadataError } = await supabase.auth.updateUser({
            data: { role: pendingOAuthRole },
          });

          if (metadataError) {
            console.error("Failed to persist OAuth role", metadataError);
          }
        }

        const { data: insertedStudent, error: insertedStudentError } =
          await supabase
          .from("student")
          .upsert(
            {
              auth_user_id: userId,
              full_name: sessionUserFullName || sessionUserName || sessionUserEmail?.split("@")[0] || "Student",
              email: sessionUserEmail,
              vark_completed: false,
            },
            { onConflict: "auth_user_id" }
          )
          .select("*")
          .maybeSingle();

        if (insertedStudentError) {
          console.error("Student profile creation failed", insertedStudentError);
        }

        clearPendingOAuthMode();
        clearPendingOAuthRole();
        setAuthNotice("");
        setUserRole("student");
        setStudentProfile(insertedStudent || null);
        setTeacherProfile(null);
        setProfileLoading(false);
        return;
      }

      if (fallbackRole === "lecturer") {
        if (!sessionUserRole && pendingOAuthRole) {
          const { error: metadataError } = await supabase.auth.updateUser({
            data: { role: pendingOAuthRole },
          });

          if (metadataError) {
            console.error("Failed to persist OAuth role", metadataError);
          }
        }

        clearPendingOAuthMode();
        clearPendingOAuthRole();
        setAuthNotice("");
        setUserRole("lecturer");
        setStudentProfile(null);
        setTeacherProfile(null);
        setProfileLoading(false);
        return;
      }

      if (pendingOAuthMode === "login") {
        clearPendingOAuthMode();
        clearPendingOAuthRole();
        await signOutUser();
        setSession(null);
        setUserRole(null);
        setStudentProfile(null);
        setTeacherProfile(null);
        setAuthNotice(
          "This Google account is not linked yet. Please create an account first."
        );
        setPage("signup");
        setProfileLoading(false);
        return;
      }

      if (studentError || teacherError) {
        console.error("Profile lookup failed", studentError || teacherError);
      } else {
        clearPendingOAuthMode();
        setUserRole(null);
      }

      setStudentProfile(null);
      setTeacherProfile(null);
      setProfileLoading(false);
    }

    void loadProfile();
  }, [
    sessionUserEmail,
    sessionUserFullName,
    sessionUserId,
    sessionUserName,
    sessionUserRole,
  ]);

  async function handleSignOut() {
    await signOutUser();
    setSession(null);
    setUserRole(null);
    setStudentProfile(null);
    setTeacherProfile(null);
    setPage("login");
  }

  function handleAdminSignOut() {
    clearStoredAdminSession();
    setAdminSession(null);
    setAuthNotice("");
    setPage("login");
  }

  async function handleAdminLogin(username, password) {
    const { data, error } = await signInAsAdmin(username, password);

    if (error) {
      return { error };
    }

    const nextAdminSession = {
      id: data.id,
      username: data.username,
      signedInAt: new Date().toISOString(),
    };

    storeAdminSession(nextAdminSession);
    setAdminSession(nextAdminSession);
    setAuthNotice("");

    return { error: null };
  }

  async function refreshStudentProfile() {
    if (!session?.user || !supabase) {
      return;
    }

    const { data } = await supabase
      .from("student")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    setStudentProfile(data || null);
  }

  async function refreshTeacherProfile() {
    if (!session?.user || !supabase) {
      return;
    }

    const { data } = await supabase
      .from("teacher")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    setTeacherProfile(data || null);
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  const isStudentOnboarding = Boolean(
    session && userRole === "student" && !studentProfile?.vark_completed
  );
  const isTeacherOnboarding = Boolean(
    session && userRole === "lecturer" && !teacherProfile
  );
  const showFloatingThemeToggle =
    !isStudentOnboarding &&
    !isTeacherOnboarding &&
    userRole !== "student" &&
    userRole !== "lecturer" &&
    (adminSession || authLoading || profileLoading || session);

  return (
    <div className="min-h-screen overflow-x-hidden">
      {showFloatingThemeToggle ? (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          className="exp-theme-toggle grid h-11 w-11 place-items-center rounded-2xl"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
      ) : null}

      {adminSession ? (
        <AdminDashboard
          adminSession={adminSession}
          onSignOut={handleAdminSignOut}
        />
      ) : authLoading || profileLoading ? (
        <AuthLoadingScreen />
      ) : session ? (
        userRole === "student" && !studentProfile?.vark_completed ? (
          <StudentOnboarding
            session={session}
            theme={theme}
            onToggleTheme={toggleTheme}
            onCompleted={refreshStudentProfile}
            onSignOut={handleSignOut}
          />
        ) : userRole === "lecturer" && !teacherProfile ? (
          <TeacherOnboarding
            session={session}
            theme={theme}
            onToggleTheme={toggleTheme}
            onCompleted={refreshTeacherProfile}
            onSignOut={handleSignOut}
          />
        ) : userRole === "lecturer" ? (
          <TeacherDashboard
            session={session}
            onSignOut={handleSignOut}
            teacherProfile={teacherProfile}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <StudentDashboard
            session={session}
            onSignOut={handleSignOut}
            userRole={userRole}
            studentProfile={studentProfile}
            onStudentProfileUpdate={setStudentProfile}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )
      ) : page === "login" ? (
        <LoginPage
          notice={authNotice}
          onAdminLogin={handleAdminLogin}
          theme={theme}
          onToggleTheme={toggleTheme}
          onCreateAccount={() => {
            setAuthNotice("");
            setPage("signup");
          }}
        />
      ) : (
        <SignupPage
          notice={authNotice}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSignIn={() => {
            setAuthNotice("");
            setPage("login");
          }}
        />
      )}
    </div>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="exp-shell text-slate-900 dark:text-white">
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <div className="exp-frame w-full max-w-sm p-6 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-500 dark:border-white/10 dark:border-t-teal-300" />
          <h1 className="mt-6 text-xl font-semibold">Loading your session</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-white/65">
            Preparing Syncra Learn...
          </p>
        </div>
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3V5.25M12 18.75V21M21 12H18.75M5.25 12H3M18.364 5.636L16.773 7.227M7.227 16.773L5.636 18.364M18.364 18.364L16.773 16.773M7.227 7.227L5.636 5.636M15.75 12A3.75 3.75 0 1 1 8.25 12A3.75 3.75 0 0 1 15.75 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
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
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.354 15.354A8.25 8.25 0 0 1 8.646 3.646A8.25 8.25 0 1 0 20.354 15.354Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
