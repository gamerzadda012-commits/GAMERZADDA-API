import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
   ADMIN AUTH
========================================================= */

async function requireAdmin(request) {
  try {
    const authorization = request.headers.get("authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return {
        ok: false,
        error: "Missing authentication token.",
      };
    }

    const token = authorization.slice(7).trim();

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

    if (authError || !authData?.user?.id) {
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
      console.error("Admin lookup error:", adminError);

      return {
        ok: false,
        error: "Unable to verify admin account.",
      };
    }

    if (adminUser?.role !== "admin") {
      return {
        ok: false,
        error: "Access denied. Admin only.",
      };
    }

    return {
      ok: true,
      userId: adminUser.id,
    };
  } catch (error) {
    console.error("requireAdmin error:", error);

    return {
      ok: false,
      error: "Authentication failed.",
    };
  }
}

/* =========================================================
   GET WITHDRAWALS
   GET /api/admin/withdrawals?status=pending
========================================================= */

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);

    if (!admin.ok) {
      return NextResponse.json(
        {
          success: false,
          error: admin.error,
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const status = (
      searchParams.get("status") || "pending"
    ).trim().toLowerCase();

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "all",
    ];

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid withdrawal status.",
        },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from("withdraw_requests")
      .select(
        `
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
      `
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(100);

    if (status !== "all") {
      query = query.eq("status", status);
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
          error: error.message || "Failed to fetch withdrawals.",
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
          "Cache-Control": "no-store, no-cache, must-revalidate",
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
        error: "Internal server error.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   APPROVE / REJECT WITHDRAWAL

   PATCH /api/admin/withdrawals

   Body:
   {
     withdrawalId: "...",
     action: "approve" | "reject",
     note: "..."
   }
========================================================= */

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);

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

    const withdrawalId = String(
      body?.withdrawalId || ""
    ).trim();

    const action = String(
      body?.action || ""
    ).trim().toLowerCase();

    const note =
      body?.note !== undefined &&
      body?.note !== null
        ? String(body.note).trim()
        : "";

    if (!withdrawalId) {
      return NextResponse.json(
        {
          success: false,
          error: "Withdrawal ID is required.",
        },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: "Action must be approve or reject.",
        },
        { status: 400 }
      );
    }

    /* -----------------------------------------------------
       Check withdrawal exists before processing
    ----------------------------------------------------- */

    const {
      data: withdrawal,
      error: withdrawalError,
    } = await supabaseAdmin
      .from("withdraw_requests")
      .select(
        `
        id,
        user_id,
        amount,
        upi_id,
        account_holder_name,
        status,
        service_charge,
        net_amount
      `
      )
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
          error: withdrawalError.message,
        },
        { status: 500 }
      );
    }

    if (!withdrawal) {
      return NextResponse.json(
        {
          success: false,
          error: "Withdrawal request not found.",
        },
        { status: 404 }
      );
    }

    if (withdrawal.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          error: `Withdrawal is already ${withdrawal.status}.`,
        },
        { status: 409 }
      );
    }

    /* -----------------------------------------------------
       Existing DB RPC handles actual processing
    ----------------------------------------------------- */

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "admin_process_withdrawal",
      {
        p_withdrawal_id: withdrawalId,
        p_action: action,
        p_note: note || null,
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

    /* -----------------------------------------------------
       RPC can return object or array depending on function
    ----------------------------------------------------- */

    const result = Array.isArray(data)
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

    return NextResponse.json(
      {
        success: true,
        message:
          result?.message ||
          `Withdrawal ${action}d successfully.`,
        withdrawal: result || null,
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