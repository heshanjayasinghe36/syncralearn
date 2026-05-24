import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type JsonObject = Record<string, unknown>;

function json(data: JsonObject, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const stripeCurrency = (Deno.env.get("STRIPE_CURRENCY") ?? "lkr").toLowerCase();
    const authHeader = request.headers.get("Authorization");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !stripeSecretKey) {
      return json(
        { error: "Missing Supabase or Stripe function secrets." },
        500
      );
    }

    if (!authHeader) {
      return json({ error: "Missing authorization header." }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "You must be signed in to continue." }, 401);
    }

    const body = await request.json();
    const courseId = Number(body?.courseId);
    const returnUrl = String(body?.returnUrl ?? "").trim();

    if (!Number.isFinite(courseId) || courseId <= 0) {
      return json({ error: "A valid course ID is required." }, 400);
    }

    if (!returnUrl) {
      return json({ error: "A valid return URL is required." }, 400);
    }

    let parsedReturnUrl: URL;

    try {
      parsedReturnUrl = new URL(returnUrl);
    } catch {
      return json({ error: "Return URL is not valid." }, 400);
    }

    const { data: student, error: studentError } = await adminClient
      .from("student")
      .select("sid, email, full_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (studentError || !student) {
      return json({ error: "Student profile was not found." }, 404);
    }

    const { data: course, error: courseError } = await adminClient
      .from("course")
      .select("cid, name, amount")
      .eq("cid", courseId)
      .maybeSingle();

    if (courseError || !course) {
      return json({ error: "Course was not found." }, 404);
    }

    const { data: existingEnrollment } = await adminClient
      .from("student_course")
      .select("sid, cid")
      .eq("sid", student.sid)
      .eq("cid", courseId)
      .maybeSingle();

    if (existingEnrollment) {
      return json({
        alreadyEnrolled: true,
      });
    }

    const courseAmount = Number(course.amount);

    if (!Number.isFinite(courseAmount) || courseAmount <= 0) {
      return json({
        requiresPayment: false,
      });
    }

    const successUrl = new URL(parsedReturnUrl.toString());
    successUrl.searchParams.set("stripe_checkout", "success");
    successUrl.searchParams.set("course_id", String(courseId));
    successUrl.searchParams.set("session_id", "STRIPE_SESSION_ID_PLACEHOLDER");

    const cancelUrl = new URL(parsedReturnUrl.toString());
    cancelUrl.searchParams.set("stripe_checkout", "cancelled");
    cancelUrl.searchParams.set("course_id", String(courseId));
    cancelUrl.searchParams.delete("session_id");

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set(
      "success_url",
      successUrl
        .toString()
        .replace(
          "STRIPE_SESSION_ID_PLACEHOLDER",
          "{CHECKOUT_SESSION_ID}"
        )
    );
    form.set("cancel_url", cancelUrl.toString());
    form.set("payment_method_types[0]", "card");
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", stripeCurrency);
    form.set(
      "line_items[0][price_data][unit_amount]",
      String(Math.round(courseAmount * 100))
    );
    form.set("line_items[0][price_data][product_data][name]", course.name);
    form.set("customer_email", student.email ?? user.email ?? "");
    form.set("metadata[course_id]", String(courseId));
    form.set("metadata[student_id]", String(student.sid));
    form.set("metadata[student_auth_user_id]", user.id);

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const stripePayload = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return json(
        {
          error:
            stripePayload?.error?.message ||
            "Stripe checkout session creation failed.",
        },
        stripeResponse.status
      );
    }

    return json({
      checkoutUrl: stripePayload.url,
      sessionId: stripePayload.id,
      requiresPayment: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected checkout error.";
    return json({ error: message }, 500);
  }
});
