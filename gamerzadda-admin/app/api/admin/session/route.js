import { NextResponse } from "next/server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  try {
    if (!URL || !ANON || !SERVICE) return NextResponse.json({ success:false, error:"Server Supabase configuration missing." }, {status:500});
    const { access_token } = await request.json();
    if (!access_token) return NextResponse.json({success:false,error:"Missing access token."},{status:400});

    const userRes = await fetch(`${URL}/auth/v1/user`, { headers:{apikey:ANON,Authorization:`Bearer ${access_token}`}, cache:"no-store" });
    if (!userRes.ok) return NextResponse.json({success:false,error:"Invalid Supabase session."},{status:401});
    const user = await userRes.json();

    const adminRes = await fetch(`${URL}/rest/v1/users?select=id,role,status&id=eq.${encodeURIComponent(user.id)}&limit=1`, {headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`},cache:"no-store"});
    if (!adminRes.ok) return NextResponse.json({success:false,error:"Could not verify admin account."},{status:500});
    const rows = await adminRes.json();
    const admin = rows?.[0];
    if (!admin || admin.role !== "admin" || admin.status !== "active") return NextResponse.json({success:false,error:"Admin access required."},{status:403});

    const response = NextResponse.json({success:true});
    response.cookies.set("gamerzadda_admin_access", access_token, {httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",maxAge:60*60*24});
    return response;
  } catch { return NextResponse.json({success:false,error:"Session verification failed."},{status:500}); }
}

export async function DELETE() {
  const response = NextResponse.json({success:true});
  response.cookies.set("gamerzadda_admin_access","",{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",maxAge:0});
  return response;
}
