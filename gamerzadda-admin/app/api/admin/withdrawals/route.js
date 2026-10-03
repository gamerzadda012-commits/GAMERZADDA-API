import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import fs from "fs";
import path from "path";

import {
  getApps,
  initializeApp,
  cert,
} from "firebase-admin/app";

import {
  getMessaging,
} from "firebase-admin/messaging";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/* =========================================================
   SUPABASE ADMIN
========================================================= */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/* =========================================================
   FIREBASE
========================================================= */

function getFirebaseAdmin() {
  const existingApps = getApps();

  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (!serviceAccountPath) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH is not configured."
    );
  }

  const fullPath = path.resolve(
    process.cwd(),
    serviceAccountPath
  );

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Firebase service account file not found: ${fullPath}`
    );
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(
      fs.readFileSync(fullPath, "utf8")
    );
  } catch (error) {
    throw new Error(
      `Firebase service account JSON is invalid: ${
        error?.message || String(error)
      }`
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

/* =========================================================
   SEND WITHDRAWAL NOTIFICATION
========================================================= */

async function sendWithdrawalNotification({
  userId,
  action,
  amount,
  netAmount,
  note,
}) {
  try {
    if (!userId) {
      console.error(
        "WITHDRAWAL NOTIFICATION: Missing user ID"
      );

      return {
        success: false,
        sent: 0,
        reason: "Missing user ID.",
      };
    }

    /* -----------------------------------------------------
       GET USER FCM TOKEN
    ----------------------------------------------------- */

    const {
      data: user,
      error: userError,
    } = await supabaseAdmin
      .from("users")
      .select("id, fcm_token")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.error(
        "WITHDRAWAL NOTIFICATION USER ERROR:",
        userError
      );

      return {
        success: false,
        sent: 0,
        reason: userError.message,
      };
    }

    if (!user) {
      console.error(
        "WITHDRAWAL NOTIFICATION: USER NOT FOUND",
        userId
      );

      return {
        success: false,
        sent: 0,
        reason: "User not found.",
      };
    }

    const token = String(
      user.fcm_token || ""
    ).trim();

    /* -----------------------------------------------------
       BUILD MESSAGE
    ----------------------------------------------------- */

    const numericNetAmount = Number(
      netAmount ?? amount ?? 0
    );

    const displayAmount =
      Number.isFinite(numericNetAmount)
        ? numericNetAmount.toFixed(2)
        : "0.00";

    let title = "";
    let message = "";

    if (action === "approve") {
      title = "✅ Withdrawal Approved";

      message =
        `Your withdrawal of ₹${displayAmount} has been approved. ` +
        "The amount will be processed to your UPI account.";
    } else {
      title = "❌ Withdrawal Rejected";

      message =
        `Your withdrawal request of ₹${displayAmount} was rejected.`;

      if (note) {
        message += ` Reason: ${note}`;
      }
    }

    /* -----------------------------------------------------
       SAVE NOTIFICATION HISTORY
    ----------------------------------------------------- */

    let historyId = null;

    try {
      const {
        data: history,
        error: historyError,
      } = await supabaseAdmin
        .from("notifications")
        .insert({
          title,
          message,
          type: "wallet",
          user_id: userId,
          redirect_url: "/wallet",
        })
        .select("id")
        .single();

      if (historyError) {
        console.error(
          "WITHDRAWAL NOTIFICATION HISTORY ERROR:",
          historyError
        );
      } else {
        historyId = history?.id || null;
      }
    } catch (historyException) {
      console.error(
        "WITHDRAWAL NOTIFICATION HISTORY EXCEPTION:",
        historyException
      );
    }

    /* -----------------------------------------------------
       NO FCM TOKEN
    ----------------------------------------------------- */

    if (!token) {
      console.log(
        "WITHDRAWAL NOTIFICATION: User has no FCM token",
        userId
      );

      return {
        success: true,
        sent: 0,
        historyId,
        reason: "User has no FCM token.",
      };
    }

    /* -----------------------------------------------------
       FIREBASE
    ----------------------------------------------------- */

    const firebaseApp = getFirebaseAdmin();
    const messaging = getMessaging(firebaseApp);

    try {
      await messaging.send({
        token,

        notification: {
          title,
          body: message,
        },

        data: {
          type: "withdrawal",
          withdrawal_action: action,
          amount: String(amount ?? ""),
          net_amount: String(netAmount ?? ""),
          title,
          body: message,
          redirect_url: "/wallet",
        },

        android: {
          priority: "high",

          notification: {
            channelId:
              "gamerzadda_notifications",
            sound: "default",
          },
        },
      });

      console.log(
        "WITHDRAWAL FCM SENT:",
        {
          userId,
          action,
          historyId,
        }
      );

      return {
        success: true,
        sent: 1,
        historyId,
      };
    } catch (sendError) {
      const errorCode =
        sendError?.code || "";

      const errorMessage =
        sendError?.message ||
        String(sendError);

      console.error(
        "WITHDRAWAL FCM SEND ERROR:",
        errorCode,
        errorMessage
      );

      /* ---------------------------------------------------
         REMOVE INVALID TOKEN
      --------------------------------------------------- */

      if (
        errorCode ===
          "messaging/registration-token-not-registered" ||
        errorCode ===
          "messaging/invalid-registration-token"
      ) {
        try {
          await supabaseAdmin
            .from("users")
            .update({
              fcm_token: null,
            })
            .eq("id", userId);

          console.log(
            "INVALID WITHDRAWAL FCM TOKEN CLEARED:",
            userId
          );
        } catch (cleanupError) {
          console.error(
            "FCM TOKEN CLEANUP ERROR:",
            cleanupError
          );
        }
      }

      return {
        success: false,
        sent: 0,
        historyId,
        reason: errorMessage,
      };
    }
  } catch (error) {
    console.error(
      "WITHDRAWAL NOTIFICATION ERROR:",
      error
    );

    return {
      success: false,
      sent: 0,
      reason:
        error?.message ||
        String(error),
    };
  }
}

/* =========================================================
   ADMIN AUTH
========================================================= */

async function requireAdmin(request) {
  try {
    const authorization =
      request.headers.get("authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return {
        ok: false,
        error: "Missing authentication token.",
      };
    }

    const token = authorization
      .slice(7)
      .trim();

    if (!token) {
      return {
        ok: false,
        error: "Missing authentication token.",
      };
    }

    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (
      authError ||
      !authData?.user?.id
    ) {
      return {
        ok: false,
        error: "Invalid or expired session.",
      };
    }

    const userId = authData.user.id;

    const {
      data: adminUser,
      error: adminError,
    } = await supabaseAdmin
      .from("users")
      .select("id, role, email")
      .eq("id", userId)
      .maybeSingle();

    if (adminError) {
      console.error(
        "Admin lookup error:",
        adminError
      );

      return {
        ok: false,
        error:
          "Unable to verify admin account.",
      };
    }

    if (adminUser?.role !== "admin") {
      return {
        ok: false,
        error:
          "Access denied. Admin only.",
      };
    }

    return {
      ok: true,
      userId: adminUser.id,
    };
  } catch (error) {
    console.error(
      "requireAdmin error:",
      error
    );

    return {
      ok: false,
      error: "Authentication failed.",
    };
  }
}

/* =========================================================
   GET WITHDRAWALS
========================================================= */

export async function GET(request) {
  try {
    const admin =
      await requireAdmin(request);

    if (!admin.ok) {
      return NextResponse.json(
        {
          success: false,
          error: admin.error,
        },
        { status: 401 }
      );
    }

    const { searchParams } =
      new URL(request.url);

    const status = (
      searchParams.get("status") ||
      "pending"
    )
      .trim()
      .toLowerCase();

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "all",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid withdrawal status.",
        },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from("withdraw_requests")
      .select(`
        id,
        user_id,
        amount,
        upi_id,
        account_holder_name,
        status,
        service_charge,
        net_amount,
        admin_note,
        created_at,
        processed_at,
        users (
          email,
          game_name,
          free_fire_uid
        )
      `)
      .order("created_at", {
        ascending: false,
      })
      .limit(100);

    if (status !== "all") {
      query = query.eq(
        "status",
        status
      );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      console.error(
        "Withdrawals fetch error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            error.message ||
            "Failed to fetch withdrawals.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        withdrawals: data || [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "GET /api/admin/withdrawals error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Internal server error.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   APPROVE / REJECT
========================================================= */

export async function PATCH(request) {
  try {
    const admin =
      await requireAdmin(request);

    if (!admin.ok) {
      return NextResponse.json(
        {
          success: false,
          error: admin.error,
        },
        { status: 401 }
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body.",
        },
        { status: 400 }
      );
    }

    const withdrawalId =
      String(
        body?.withdrawalId || ""
      ).trim();

    const action =
      String(
        body?.action || ""
      )
        .trim()
        .toLowerCase();

    const note =
      body?.note !== undefined &&
      body?.note !== null
        ? String(body.note).trim()
        : "";

    if (!withdrawalId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Withdrawal ID is required.",
        },
        { status: 400 }
      );
    }

    if (
      !["approve", "reject"].includes(
        action
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Action must be approve or reject.",
        },
        { status: 400 }
      );
    }

    /* =====================================================
       GET WITHDRAWAL
    ===================================================== */

    const {
      data: withdrawal,
      error: withdrawalError,
    } = await supabaseAdmin
      .from("withdraw_requests")
      .select(`
        id,
        user_id,
        amount,
        upi_id,
        account_holder_name,
        status,
        service_charge,
        net_amount
      `)
      .eq("id", withdrawalId)
      .maybeSingle();

    if (withdrawalError) {
      console.error(
        "Withdrawal lookup error:",
        withdrawalError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            withdrawalError.message,
        },
        { status: 500 }
      );
    }

    if (!withdrawal) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Withdrawal request not found.",
        },
        { status: 404 }
      );
    }

    if (
      withdrawal.status !==
      "pending"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Withdrawal is already ${withdrawal.status}.`,
        },
        { status: 409 }
      );
    }

    /* =====================================================
       PROCESS RPC
    ===================================================== */

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "admin_process_withdrawal",
      {
        p_withdrawal_id:
          withdrawalId,
        p_action: action,
        p_note:
          note || null,
      }
    );

    if (error) {
      console.error(
        "admin_process_withdrawal RPC error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            error.message ||
            "Failed to process withdrawal.",
        },
        { status: 500 }
      );
    }

    const result =
      Array.isArray(data)
        ? data[0]
        : data;

    if (
      result &&
      result.success === false
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            result.message ||
            "Withdrawal processing failed.",
          data: result,
        },
        { status: 400 }
      );
    }

    /* =====================================================
       SEND USER NOTIFICATION
       IMPORTANT:
       Withdrawal is already successfully processed
       before notification is attempted.
    ===================================================== */

    const notification =
      await sendWithdrawalNotification({
        userId:
          withdrawal.user_id,
        action,
        amount:
          withdrawal.amount,
        netAmount:
          withdrawal.net_amount ??
          withdrawal.amount,
        note,
      });

    console.log(
      "WITHDRAWAL NOTIFICATION RESULT:",
      notification
    );

    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        message:
          result?.message ||
          `Withdrawal ${action}d successfully.`,

        withdrawal:
          result || null,

        notification: {
          success:
            notification.success,
          sent:
            notification.sent,
          historyId:
            notification.historyId ||
            null,
          reason:
            notification.reason ||
            null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "PATCH /api/admin/withdrawals error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Internal server error.",
      },
      { status: 500 }
    );
  }
}