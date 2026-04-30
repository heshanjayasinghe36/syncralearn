import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const pendingOAuthRoleKey = "syncralearn.pending_oauth_role";
const pendingOAuthModeKey = "syncralearn.pending_oauth_mode";
const adminSessionKey = "syncralearn.admin_session";

function hasValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const supabaseConfigError =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl === "your_supabase_project_url" ||
  supabaseAnonKey === "your_supabase_anon_key"
    ? "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env."
    : !hasValidUrl(supabaseUrl)
      ? "VITE_SUPABASE_URL is not a valid URL."
      : null;

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);

export async function signInWithEmail(email, password) {
  if (!supabase) {
    return {
      data: null,
      error: new Error(supabaseConfigError || "Supabase is not configured."),
    };
  }

  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signInAsAdmin(username, password) {
  if (!supabase) {
    return {
      data: null,
      error: new Error(supabaseConfigError || "Supabase is not configured."),
    };
  }

  const normalizedUsername = username.trim();

  if (!normalizedUsername || !password) {
    return {
      data: null,
      error: new Error("Enter the admin username and password."),
    };
  }

  const { data, error } = await supabase
    .from("admin")
    .select("id, username")
    .eq("username", normalizedUsername)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (!data) {
    return {
      data: null,
      error: new Error("Invalid admin username or password."),
    };
  }

  return { data, error: null };
}

export function getPendingOAuthRole() {
  if (typeof window === "undefined") {
    return null;
  }

  const role = window.localStorage.getItem(pendingOAuthRoleKey);
  return role === "student" || role === "lecturer" ? role : null;
}

export function getPendingOAuthMode() {
  if (typeof window === "undefined") {
    return null;
  }

  const mode = window.localStorage.getItem(pendingOAuthModeKey);
  return mode === "login" || mode === "signup" ? mode : null;
}

export function clearPendingOAuthRole() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(pendingOAuthRoleKey);
}

export function clearPendingOAuthMode() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(pendingOAuthModeKey);
}

export function getStoredAdminSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(adminSessionKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed?.username ? parsed : null;
  } catch {
    return null;
  }
}

export function storeAdminSession(adminSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(adminSessionKey, JSON.stringify(adminSession));
}

export function clearStoredAdminSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(adminSessionKey);
}

function setPendingOAuthRole(role) {
  if (typeof window === "undefined") {
    return;
  }

  if (role === "student" || role === "lecturer") {
    window.localStorage.setItem(pendingOAuthRoleKey, role);
    return;
  }

  window.localStorage.removeItem(pendingOAuthRoleKey);
}

function setPendingOAuthMode(mode) {
  if (typeof window === "undefined") {
    return;
  }

  if (mode === "login" || mode === "signup") {
    window.localStorage.setItem(pendingOAuthModeKey, mode);
    return;
  }

  window.localStorage.removeItem(pendingOAuthModeKey);
}

export async function continueWithGoogle({ role, mode } = {}) {
  if (!supabase) {
    return {
      data: null,
      error: new Error(supabaseConfigError || "Supabase is not configured."),
    };
  }

  setPendingOAuthRole(role);
  setPendingOAuthMode(mode);

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo:
        typeof window === "undefined" ? undefined : window.location.origin,
    },
  });
}

export async function signOutUser() {
  if (!supabase) {
    return {
      error: new Error(supabaseConfigError || "Supabase is not configured."),
    };
  }

  return supabase.auth.signOut();
}
