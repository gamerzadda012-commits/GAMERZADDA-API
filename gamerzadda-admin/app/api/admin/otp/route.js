import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePhone(phone): string | null {
  const cleaned = String(phone || "").replace(/\D/g, "");

  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  if (
    cleaned.length === 12 &&
    cleaned.startsWith("91") &&
    /^[6-9]\d{9}$/.test(cleaned.slice(2))
  ) {
    return cleaned.slice(2);
  }

  return null;
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (bearerToken) {
    const { data, error } =
      await supabaseAdmin.auth.getUser(bearerToken);

    if (!error && data?.user?.id) {
      const { data: admin, error: adminError } =
        await supabaseAdmin
          .from("users")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

      if (!adminError && admin?.role === "admin") {
        return { ok: true, userId: data.user.id };
      }

      return {
        ok: false,
        error: "Access denied. Admin only.",
      };
    }
  }

  const token =
    request.cookies.get("gamerzadda_session")?.value;

  if (!token) {
    return {
      ok: false,
      error: "Admin login required.",
    };
  }

  let sessionToken = token;

  try {
    sessionToken = decodeURIComponent(token);
  } catch {}

  const tokenHash = hashValue(sessionToken);

  const { data: session, error: sessionError } =
    await supabaseAdmin
      .from("user_sessions")
      .select("user_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

  if (sessionError || !session?.user_id) {
    return {
      ok: false,
      error: "Invalid session.",
    };
  }

  if (
    session.expires_at &&
    new Date(session.expires_at) <= new Date()
  ) {
    return {
      ok: false,
      error: "Session expired.",
    };
  }

  const { data: admin, error: adminError } =
    await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", session.user_id)
      .maybeSingle();

  if (adminError || admin?.role !== "admin") {
    return {
      ok: false,
      error: "Access denied. Admin only.",
    };
  }

  return {
    ok: true,
    userId: session.user_id,
  };
}

async function getOtpAbuseRecord(phone: string) {
  const { data, error } = await supabaseAdmin
    .from("otp_abuse_limits")
    .select(
      [
        "id",
        "phone",
        "flow",
        "wrong_attempts",
        "locked_until",
        "is_blocked",
        "blocked_at",
        "unblocked_at",
        "resend_attempts",
        "resend_locked_until",
        "resend_is_blocked",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .eq("phone", phone)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Admin OTP abuse lookup error:", error);
    throw new Error("Unable to load OTP security information.");
  }

  return data || [];
}

async function getLatestOtp(phone: string) {
  const { data, error } = await supabaseAdmin
    .from("otp_codes")
    .select(
      "id, phone, flow, expires_at, attempts, verified, created_at"
    )
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Admin OTP code lookup error:", error);
    // Do not make the whole control page unusable if this optional
    // diagnostic query fails.
    return [];
  }

  return data || [];
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const phone = normalizePhone(
      request.nextUrl.searchParams.get("phone")
    );

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid 10-digit Indian mobile number.",
        },
        { status: 400 }
      );
    }

    const [abuse, latestOtp] = await Promise.all([
      getOtpAbuseRecord(phone),
      getLatestOtp(phone),
    ]);

    return NextResponse.json({
      success: true,
      phone,
      abuse,
      latestOtp,
    });
  } catch (error) {
    console.error("Admin OTP GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Something went wrong.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const phone = normalizePhone(body?.phone);
    const action = String(body?.action || "")
      .trim()
      .toLowerCase();

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid 10-digit Indian mobile number.",
        },
        { status: 400 }
      );
    }

    const allowed = [
      "unblock_wrong",
      "unblock_resend",
      "reset",
    ];

    if (!allowed.includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid OTP admin action.",
        },
        { status: 400 }
      );
    }

    const { data: existing, error: lookupError } =
      await supabaseAdmin
        .from("otp_abuse_limits")
        .select("id, phone, flow")
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(10);

    if (lookupError) {
      console.error(
        "Admin OTP abuse action lookup error:",
        lookupError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to load OTP security record.",
        },
        { status: 500 }
      );
    }

    /*
     * If no abuse record exists, create clean login/signup rows
     * so admin actions remain deterministic.
     */
    if (!existing?.length) {
      if (action === "reset") {
        await supabaseAdmin
          .from("otp_codes")
          .update({ verified: true })
          .eq("phone", phone)
          .eq("verified", false);

        return NextResponse.json({
          success: true,
          action,
          message:
            "OTP security reset. The current OTP, if any, was invalidated.",
          abuse: [],
        });
      }

      return NextResponse.json({
        success: true,
        action,
        message: "No active OTP abuse record exists for this number.",
        abuse: [],
      });
    }

    if (action === "unblock_wrong") {
      const { error } = await supabaseAdmin
        .from("otp_abuse_limits")
        .update({
          wrong_attempts: 0,
          locked_until: null,
          is_blocked: false,
          unblocked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("phone", phone);

      if (error) {
        console.error("OTP wrong-attempt unblock error:", error);

        return NextResponse.json(
          {
            success: false,
            error: error.message || "Unable to unblock OTP attempts.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action,
        message:
          "Wrong-OTP block removed. Resend restriction was preserved.",
        abuse: await getOtpAbuseRecord(phone),
      });
    }

    if (action === "unblock_resend") {
      const { error } = await supabaseAdmin
        .from("otp_abuse_limits")
        .update({
          resend_attempts: 0,
          resend_locked_until: null,
          resend_is_blocked: false,
          updated_at: new Date().toISOString(),
        })
        .eq("phone", phone);

      if (error) {
        console.error("OTP resend unblock error:", error);

        return NextResponse.json(
          {
            success: false,
            error: error.message || "Unable to unblock OTP resend.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action,
        message:
          "OTP resend restriction removed. Wrong-OTP protection was preserved.",
        abuse: await getOtpAbuseRecord(phone),
      });
    }

    /*
     * FULL RESET
     *
     * Clears both wrong-OTP and resend protection and invalidates
     * every currently unverified OTP for this phone.
     */
    const { error: deleteError } = await supabaseAdmin
      .from("otp_abuse_limits")
      .delete()
      .eq("phone", phone);

    if (deleteError) {
      console.error("OTP full reset error:", deleteError);

      return NextResponse.json(
        {
          success: false,
          error:
            deleteError.message ||
            "Unable to fully reset OTP protection.",
        },
        { status: 500 }
      );
    }

    const { error: invalidateError } = await supabaseAdmin
      .from("otp_codes")
      .update({ verified: true })
      .eq("phone", phone)
      .eq("verified", false);

    if (invalidateError) {
      console.error(
        "OTP invalidation after reset error:",
        invalidateError
      );
    }

    return NextResponse.json({
      success: true,
      action: "reset",
      message:
        "OTP protection fully reset. Wrong-attempt and resend limits were cleared and current OTPs were invalidated.",
      abuse: [],
    });
  } catch (error) {
    console.error("Admin OTP PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
