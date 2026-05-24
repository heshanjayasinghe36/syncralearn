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
    const sessionId = String(body?.sessionId ?? "").trim();

    if (!Number.isFinite(courseId) || courseId <= 0 || !sessionId) {
      return json({ error: "Course ID and Stripe session ID are required." }, 400);
    }

    const { data: student, error: studentError } = await adminClient
      .from("student")
      .select("sid")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (studentError || !student) {
      return json({ error: "Student profile was not found." }, 404);
    }

    const { data: course, error: courseError } = await adminClient
      .from("course")
      .select("cid, amount")
      .eq("cid", courseId)
      .maybeSingle();

    if (courseError || !course) {
      return json({ error: "Course was not found." }, 404);
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    const stripePayload = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return json(
        {
          error:
            stripePayload?.error?.message ||
            "Stripe checkout session verification failed.",
        },
        stripeResponse.status
      );
    }

    if (stripePayload.payment_status !== "paid") {
      return json({ error: "Stripe payment is not marked as paid yet." }, 400);
    }

    if (String(stripePayload.metadata?.course_id ?? "") !== String(courseId)) {
      return json({ error: "Stripe session course does not match." }, 400);
    }

    if (
      String(stripePayload.metadata?.student_auth_user_id ?? "") !== String(user.id)
    ) {
      return json({ error: "Stripe session student does not match." }, 403);
    }

    const paymentIntentId =
      typeof stripePayload.payment_intent === "string"
        ? stripePayload.payment_intent
        : stripePayload.payment_intent?.id || sessionId;

    const { data: existingPayment } = await adminClient
      .from("payment")
      .select("pid")
      .eq("gateway_payment_id", paymentIntentId)
      .maybeSingle();

    let paymentId = existingPayment?.pid ?? null;

    if (!paymentId) {
      const paidAt =
        stripePayload.payment_intent?.created
          ? new Date(Number(stripePayload.payment_intent.created) * 1000).toISOString()
          : new Date().toISOString();

      const amount =
        Number.isFinite(Number(course.amount)) && Number(course.amount) > 0
          ? Number(course.amount)
          : Number(stripePayload.amount_total || 0) / 100;

      const { data: insertedPayment, error: paymentError } = await adminClient
        .from("payment")
        .insert({
          amount,
          cid: courseId,
          sid: student.sid,
          status: "paid",
          gateway_payment_id: paymentIntentId,
          paid_at: paidAt,
        })
        .select("pid")
        .maybeSingle();

      if (paymentError || !insertedPayment) {
        return json(
          {
            error:
              paymentError?.message || "Payment record creation failed.",
          },
          500
        );
      }

      paymentId = insertedPayment.pid;
    }

    const { error: enrollmentError } = await adminClient
      .from("student_course")
      .upsert(
        {
          sid: student.sid,
          cid: courseId,
          pid: paymentId,
        },
        {
          onConflict: "sid,cid",
        }
      );

    if (enrollmentError) {
      return json({ error: enrollmentError.message }, 500);
    }

    return json({
      success: true,
      paymentId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected confirmation error.";
    return json({ error: message }, 500);
  }
});
