import { supabase, supabaseConfigError } from "./supabase";

const pendingStripeCheckoutKey = "syncralearn.pending_stripe_checkout";

export function getPendingStripeCheckout() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(pendingStripeCheckoutKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function setPendingStripeCheckout(value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    pendingStripeCheckoutKey,
    JSON.stringify({
      ...value,
      savedAt: new Date().toISOString(),
    })
  );
}

export function clearPendingStripeCheckout() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(pendingStripeCheckoutKey);
}

export function getStripeCheckoutReturnParams() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const status = params.get("stripe_checkout");
  const sessionId = params.get("session_id");
  const courseId = params.get("course_id");

  if (!status && !sessionId && !courseId) {
    return null;
  }

  return {
    status,
    sessionId,
    courseId,
  };
}

export function clearStripeCheckoutReturnParams() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  url.searchParams.delete("stripe_checkout");
  url.searchParams.delete("session_id");
  url.searchParams.delete("course_id");

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

export async function createStripeCheckoutSession({
  courseId,
  returnUrl,
}) {
  if (!supabase) {
    return {
      data: null,
      error: new Error(supabaseConfigError || "Supabase is not configured."),
    };
  }

  const result = await supabase.functions.invoke("create-stripe-checkout", {
    body: {
      courseId,
      returnUrl,
    },
  });

  return normalizeFunctionResult(result);
}

export async function confirmStripeEnrollment({
  courseId,
  sessionId,
}) {
  if (!supabase) {
    return {
      data: null,
      error: new Error(supabaseConfigError || "Supabase is not configured."),
    };
  }

  const result = await supabase.functions.invoke("confirm-stripe-enrollment", {
    body: {
      courseId,
      sessionId,
    },
  });

  return normalizeFunctionResult(result);
}

async function normalizeFunctionResult(result) {
  if (!result?.error) {
    return result;
  }

  const errorMessage = await getFunctionErrorMessage(result.error);

  return {
    data: result.data ?? null,
    error: new Error(errorMessage),
  };
}

async function getFunctionErrorMessage(error) {
  const fallbackMessage =
    error?.message || "Edge Function returned a non-2xx status code";

  const response = error?.context;

  if (!response || typeof response.clone !== "function") {
    return fallbackMessage;
  }

  try {
    const payload = await response.clone().json();

    if (payload?.error && typeof payload.error === "string") {
      return payload.error;
    }

    if (payload?.message && typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    try {
      const text = await response.clone().text();

      if (text) {
        return text;
      }
    } catch {
      return fallbackMessage;
    }
  }

  return fallbackMessage;
}
