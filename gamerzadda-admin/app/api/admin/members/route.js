import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  if (bearerToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
    if (!error && data?.user?.id) {
      let { data: admin, error: adminError } = await supabaseAdmin
        .from("users").select("id, role, email").eq("id", data.user.id).maybeSingle();

      if (admin?.role !== "admin" && data.user.email) {
        const result = await supabaseAdmin
          .from("users").select("id, role, email")
          .ilike("email", data.user.email.trim().toLowerCase()).maybeSingle();
        admin = result.data;
        adminError = result.error;
      }

      if (!adminError && admin?.role === "admin") return { ok: true, userId: admin.id };
      return { ok: false, error: "Access denied. Admin only." };
    }
  }

  const rawToken = request.cookies.get("gamerzadda_session")?.value;
  if (!rawToken) return { ok: false, error: "Admin login required." };

  let decodedToken = rawToken;
  try { decodedToken = decodeURIComponent(rawToken); } catch {}

  const candidates = [...new Set([decodedToken, rawToken, hashValue(decodedToken), hashValue(rawToken)])];
  let session = null;
  let sessionError = null;

  for (const candidate of candidates) {
    const result = await supabaseAdmin.from("user_sessions")
      .select("user_id, expires_at").eq("token_hash", candidate).maybeSingle();
    if (result.data?.user_id) { session = result.data; sessionError = null; break; }
    sessionError = result.error;
  }

  if (sessionError || !session?.user_id) return { ok: false, error: "Invalid session." };
  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) return { ok: false, error: "Session expired." };

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("users").select("id, role").eq("id", session.user_id).maybeSingle();

  if (adminError || admin?.role !== "admin") return { ok: false, error: "Access denied. Admin only." };
  return { ok: true, userId: admin.id };
}

function extractProfileUrl(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    for (const key of ["url","publicUrl","public_url","href","src","path"]) {
      if (typeof value?.[key] === "string" && value[key].trim()) return value[key].trim();
    }
  }
  return "";
}

const profileKeys = [
  "profile_pic","profile_picture","profile_image","profile_image_url",
  "profile_photo","profile_photo_url","avatar_url","photo_url","image_url",
  "avatar","photo","picture","profile_url","image","avatarUrl","photoUrl","profileUrl"
];

function extractProfileFromObject(obj) {
  if (!obj) return "";
  for (const key of profileKeys) {
    const found = extractProfileUrl(obj[key]);
    if (found) return found;
  }
  for (const nestedKey of ["user_metadata","metadata","profile","data"]) {
    const nested = obj?.[nestedKey];
    if (nested && typeof nested === "object") {
      for (const key of profileKeys) {
        const found = extractProfileUrl(nested[key]);
        if (found) return found;
      }
    }
  }
  return "";
}

async function getProfileMap() {
  const map = {};
  try {
    for (let page = 1; page <= 20; page++) {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      const users = data?.users || [];
      if (!users.length) break;
      for (const u of users) {
        const url = extractProfileFromObject(u?.user_metadata || {});
        if (url) {
          map[u.id] = String(url);
          if (u.email) map[`email:${String(u.email).toLowerCase()}`] = String(url);
        }
      }
      if (users.length < 1000) break;
    }
  } catch (e) {
    console.warn("Auth profile lookup skipped:", e?.message || e);
  }

  for (const table of ["profiles","user_profiles","user_profile","profile"]) {
    try {
      const { data, error } = await supabaseAdmin.from(table).select("*").limit(5000);
      if (error || !Array.isArray(data)) continue;
      for (const row of data) {
        const url = extractProfileFromObject(row);
        if (!url) continue;
        const uid = row?.user_id || row?.userId || row?.uid || row?.id;
        const email = row?.email;
        if (uid) map[String(uid)] = String(url);
        if (email) map[`email:${String(email).toLowerCase()}`] = String(url);
      }
    } catch {}
  }
  return map;
}

async function getActiveRestrictionMap(ids) {
  const map = {};
  if (!ids.length) return map;
  const { data, error } = await supabaseAdmin
    .from("user_restrictions")
    .select("id,user_id,feature,expires_at,is_permanent,is_active,reason,created_at,updated_at")
    .in("user_id", ids)
    .eq("is_active", true);

  if (error) throw error;
  for (const row of data || []) {
    if (!map[row.user_id]) map[row.user_id] = [];
    if (!row.is_permanent && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await supabaseAdmin.from("user_restrictions").update({ is_active:false, updated_at:new Date().toISOString() }).eq("id", row.id);
      continue;
    }
    map[row.user_id].push(row);
  }
  return map;
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ success:false, error:auth.error }, { status:401 });

    const userId = request.nextUrl.searchParams.get("userId");

    if (userId) {
      const [walletResult, historyResult, memberResult, restrictionsResult] = await Promise.all([
        supabaseAdmin.from("wallet_balances").select("user_id,deposit_balance,bonus_balance,winning_balance,updated_at").eq("user_id",userId).maybeSingle(),
        supabaseAdmin.from("wallet_transactions").select("id,user_id,amount,type,description,reference_id,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(8),
        supabaseAdmin.from("users").select("*").eq("id",userId).maybeSingle(),
        supabaseAdmin.from("user_restrictions").select("id,user_id,feature,expires_at,is_permanent,is_active,reason,created_at,updated_at").eq("user_id",userId).eq("is_active",true).order("created_at",{ascending:false}),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (historyResult.error) throw historyResult.error;
      if (memberResult.error) throw memberResult.error;
      if (restrictionsResult.error) throw restrictionsResult.error;

      const member = memberResult.data;
      let restrictions = [];
      for (const r of restrictionsResult.data || []) {
        if (!r.is_permanent && r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) {
          await supabaseAdmin.from("user_restrictions").update({ is_active:false, updated_at:new Date().toISOString() }).eq("id",r.id);
        } else restrictions.push(r);
      }

      let referredUsers = [];
      if (member?.referral_code) {
        const { data, error } = await supabaseAdmin.from("users")
          .select("id,full_name,email,game_name,free_fire_uid,referral_code,referred_by,created_at")
          .eq("referred_by",member.referral_code).order("created_at",{ascending:false}).limit(20);
        if (error) throw error;
        referredUsers = data || [];
      }

      return NextResponse.json({
        success:true,
        member,
        wallet:walletResult.data || {deposit_balance:0,bonus_balance:0,winning_balance:0},
        history:historyResult.data || [],
        referral:{users:referredUsers,total_referrals:referredUsers.length},
        restrictions,
      },{headers:{"Cache-Control":"no-store"}});
    }

    const { data: members, error: membersError } = await supabaseAdmin.from("users").select("*").order("created_at",{ascending:false});
    if (membersError) throw membersError;

    const rows = members || [];
    const ids = rows.map(m=>m.id).filter(Boolean);
    const profileMap = await getProfileMap();
    const restrictionMap = await getActiveRestrictionMap(ids);
    const walletMap = {};

    if (ids.length) {
      const { data: wallets, error } = await supabaseAdmin.from("wallet_balances")
        .select("user_id,deposit_balance,bonus_balance,winning_balance").in("user_id",ids);
      if (error) throw error;
      for (const w of wallets || []) {
        walletMap[w.user_id] = {
          deposit_balance:Number(w.deposit_balance||0),
          bonus_balance:Number(w.bonus_balance||0),
          winning_balance:Number(w.winning_balance||0),
        };
      }
    }

    return NextResponse.json({
      success:true,
      members:rows.map(member=>{
        const rs = restrictionMap[member.id] || [];
        const w = walletMap[member.id] || {};
        return {
          ...member,
          profile_pic:extractProfileFromObject(member) || profileMap[member.id] || (member.email ? profileMap[`email:${String(member.email).toLowerCase()}`] : "") || "",
          wallet_total:Number(w.deposit_balance||0)+Number(w.bonus_balance||0)+Number(w.winning_balance||0),
          active_restrictions_count:rs.length,
          active_restrictions:rs.map(r=>r.feature),
        };
      }),
    },{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    console.error("Admin members API GET error:",error);
    return NextResponse.json({success:false,error:error?.message||"Unable to load members."},{status:500});
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({success:false,error:auth.error},{status:401});

    const body = await request.json();
    const userId = String(body?.userId||"").trim();
    const action = String(body?.action||"").trim();

    if (!userId) return NextResponse.json({success:false,error:"Member ID is required."},{status:400});

    if (action === "set_restriction" || action === "remove_restriction") {
      const feature = String(body?.feature||"").trim();
      const allowed = new Set(["full_app","freefire","freefiremax","clashsquad","lonewolf","spin","scratch_card","withdrawal","deposit","support"]);
      if (!allowed.has(feature)) return NextResponse.json({success:false,error:"Invalid restriction feature."},{status:400});

      const { data: target, error: targetError } = await supabaseAdmin.from("users").select("id,role").eq("id",userId).maybeSingle();
      if (targetError || !target) return NextResponse.json({success:false,error:"Member not found."},{status:404});
      if (String(target.role||"").toLowerCase()==="admin") return NextResponse.json({success:false,error:"Admin accounts cannot be restricted."},{status:403});

      if (action === "remove_restriction") {
        const { error } = await supabaseAdmin.from("user_restrictions")
          .update({is_active:false,updated_at:new Date().toISOString()})
          .eq("user_id",userId).eq("feature",feature).eq("is_active",true);
        if (error) throw error;
        return NextResponse.json({success:true,action,feature,message:"Restriction removed."});
      }

      const reason = String(body?.reason||"").trim().slice(0,500);
      if (!reason) return NextResponse.json({success:false,error:"Restriction reason is required."},{status:400});

      const mode = body?.mode === "permanent" ? "permanent" : "temporary";
      let expiresAt = null;
      let isPermanent = mode === "permanent";

      if (!isPermanent) {
        const days = Number(body?.durationDays);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
          return NextResponse.json({success:false,error:"Restriction duration must be between 1 and 365 days."},{status:400});
        }
        const until = new Date();
        until.setDate(until.getDate()+days);
        expiresAt = until.toISOString();
      }

      const { data: existing, error: existingError } = await supabaseAdmin.from("user_restrictions")
        .select("id").eq("user_id",userId).eq("feature",feature).eq("is_active",true).maybeSingle();
      if (existingError) throw existingError;

      const payload = {
        user_id:userId, feature, expires_at:expiresAt, is_permanent:isPermanent,
        is_active:true, reason, updated_at:new Date().toISOString(),
      };

      let saved;
      if (existing?.id) {
        const { data,error } = await supabaseAdmin.from("user_restrictions").update(payload).eq("id",existing.id).select("*").single();
        if (error) throw error;
        saved = data;
      } else {
        const { data,error } = await supabaseAdmin.from("user_restrictions").insert(payload).select("*").single();
        if (error) throw error;
        saved = data;
      }

      return NextResponse.json({success:true,action,feature,restriction:saved,message:"Restriction applied successfully."});
    }

    // Existing wallet add/deduct API.
    const walletType = String(body?.walletType||"").trim();
    const walletAction = String(action||"").trim();
    const amount = Number(body?.amount);
    const reason = String(body?.reason||"").trim();
    const columns = { bonus:"bonus_balance", deposit:"deposit_balance", winning:"winning_balance" };
    const column = columns[walletType];

    if (!column) return NextResponse.json({success:false,error:"Invalid member or wallet type."},{status:400});
    if (!["add","deduct"].includes(walletAction)) return NextResponse.json({success:false,error:"Invalid wallet action."},{status:400});
    if (!Number.isFinite(amount) || amount<=0) return NextResponse.json({success:false,error:"Enter a valid amount."},{status:400});

    let {data:current,error:fetchError}=await supabaseAdmin.from("wallet_balances").select("deposit_balance,bonus_balance,winning_balance").eq("user_id",userId).maybeSingle();
    if(fetchError) throw fetchError;

    if(!current){
      const {data:created,error:createError}=await supabaseAdmin.from("wallet_balances").insert({user_id:userId,deposit_balance:0,bonus_balance:0,winning_balance:0}).select("deposit_balance,bonus_balance,winning_balance").single();
      if(createError){
        if(createError.code==="23505"){
          const retry=await supabaseAdmin.from("wallet_balances").select("deposit_balance,bonus_balance,winning_balance").eq("user_id",userId).maybeSingle();
          if(retry.error) throw retry.error; current=retry.data;
        }else throw createError;
      }else current=created;
    }

    if(!current) return NextResponse.json({success:false,error:"Unable to create wallet for this member."},{status:409});
    const oldValue=Number(current[column]||0);
    const newValue=Number((walletAction==="add"?oldValue+amount:oldValue-amount).toFixed(2));
    if(newValue<0) return NextResponse.json({success:false,error:`${walletType.toUpperCase()} balance cannot go below ₹0.`},{status:400});

    const {data:updated,error:updateError}=await supabaseAdmin.from("wallet_balances").update({[column]:newValue,updated_at:new Date().toISOString()}).eq("user_id",userId).select("deposit_balance,bonus_balance,winning_balance,updated_at").maybeSingle();
    if(updateError) throw updateError;
    if(!updated) return NextResponse.json({success:false,error:"Wallet update failed."},{status:409});

    try{
      await supabaseAdmin.from("wallet_transactions").insert({
        user_id:userId,amount:walletAction==="add"?amount:-amount,
        type:walletAction==="add"?`admin_${walletType}_credit`:`admin_${walletType}_debit`,
        description:reason||`Admin ${walletAction} - ${walletType} balance`,
      });
    }catch(e){console.warn("Wallet audit insert skipped:",e);}

    return NextResponse.json({success:true,wallet:updated});
  } catch(error) {
    console.error("Admin members API PATCH error:",error);
    return NextResponse.json({success:false,error:error?.message||"Admin member update failed."},{status:500});
  }
}
