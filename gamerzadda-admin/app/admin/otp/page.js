"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
const RED = "#ff174f";

function fmt(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function Badge({ children, tone = "gray" }) {
  const map = {
    green: ["#ecfdf3", "#15803d"],
    red: ["#fff1f2", "#be123c"],
    orange: ["#fff7ed", "#c2410c"],
    blue: ["#eff6ff", "#1d4ed8"],
    gray: ["#f8fafc", "#475569"],
  };
  const [bg, color] = map[tone] || map.gray;
  return <span style={{display:"inline-flex",padding:"5px 9px",borderRadius:999,background:bg,color,fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>{children}</span>;
}

function Card({ children }) {
  return <div style={{background:"#fff",border:"1px solid #e8edf3",borderRadius:18,padding:18,boxShadow:"0 8px 30px rgba(15,23,42,.05)"}}>{children}</div>;
}

export default function Page() {
  const [phone,setPhone]=useState("");
  const [flow,setFlow]=useState("all");
  const [status,setStatus]=useState("all");
  const [period,setPeriod]=useState("7");
  const [ip,setIp]=useState("");
  const [blockIp,setBlockIp]=useState("");
  const [sort,setSort]=useState("newest");
  const [limit,setLimit]=useState(200);
  const [data,setData]=useState({requests:[],stats:{},phoneRanking:[],ipRanking:[],blockedIps:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [busyIp,setBusyIp]=useState("");
  const [reason,setReason]=useState("");
  const [showBlockBox,setShowBlockBox]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try{
      const q=new URLSearchParams({phone,flow,status:status==="blocked"?"all":status,period,ip,sort,limit:String(limit)});
      const r=await fetch(`/api/admin/otp?${q.toString()}`,{cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j.success) throw new Error(j.message||"Unable to load OTP activity");
      if(status==="blocked") {
        const blockedPhones=new Set((j.blockedPhones||[]).map(String));
        const blockedIpsNow=new Set((j.blockedIps||[]).map(x=>String(x.ip_address)));
        j.requests=(j.requests||[]).filter(x=>blockedPhones.has(String(x.phone||""))||blockedIpsNow.has(String(x.ip_address||"")));
      }
      setData(j);
    }catch(e){setError(e.message||"Unable to load OTP activity");}
    finally{setLoading(false);}
  },[phone,flow,status,period,ip,sort,limit]);

  useEffect(()=>{load();},[load]);

  const controlIp=async(ipAddress,action)=>{
    setBusyIp(ipAddress); setError("");
    try{
      const r=await fetch("/api/admin/otp",{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action,
          ip_address:ipAddress,
          reason: action==="block_ip" ? (reason.trim()||"Blocked by admin") : undefined,
          is_permanent:true
        })
      });
      const j=await r.json();
      if(!r.ok||!j.success) throw new Error(j.message||"Unable to update IP block");
      setReason("");
      setBlockIp("");
      setShowBlockBox(false);
      await load();
    }catch(e){setError(e.message||"Unable to update IP block");}
    finally{setBusyIp("");}
  };

  const statCards=useMemo(()=>[
    ["Total OTP requests",data.stats.total||0,"All matching requests"],
    ["Unique numbers",data.stats.uniquePhones||0,"Phone numbers"],
    ["Unique IPs",data.stats.uniqueIps||0,"Source IPs"],
    ["Failed / expired",data.stats.failed||0,"Not currently successful"],
    ["Blocked numbers",data.stats.blocked||0,"OTP abuse blocks"],
  ],[data]);

  const blockedSet=new Set((data.blockedIps||[]).map(x=>String(x.ip_address)));

  return <main style={{padding:24,maxWidth:1600,margin:"0 auto",color:"#0f172a"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap",alignItems:"center"}}>
        <div>
          <div style={{color:RED,fontSize:12,fontWeight:900,letterSpacing:1}}>SECURITY</div>
          <h1 style={{margin:"5px 0",fontSize:30,fontWeight:900}}>OTP Activity</h1>
          <p style={{margin:0,color:"#64748b"}}>Every OTP initiation with exact date, time and source IP.</p>
        </div>
        <button onClick={load} style={{border:0,borderRadius:12,background:RED,color:"#fff",padding:"11px 18px",fontWeight:800,cursor:"pointer"}}>↻ Refresh</button>
      </div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:22}}>
        {statCards.map(([label,value,sub])=><Card key={label}><div style={{minWidth:150}}><div style={{fontSize:12,color:"#64748b",fontWeight:800}}>{label}</div><div style={{fontSize:27,fontWeight:900,marginTop:5}}>{value}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{sub}</div></div></Card>)}
      </div>

      <Card>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Search phone number" style={inputStyle}/>
          <select value={flow} onChange={e=>setFlow(e.target.value)} style={inputStyle}><option value="all">All flows</option><option value="login">Login</option><option value="signup">Signup</option></select>
          <select value={status} onChange={e=>setStatus(e.target.value)} style={inputStyle}><option value="all">All status</option><option value="active">Sent / active</option><option value="verified">Verified</option><option value="expired">Expired</option><option value="failed">Failed</option><option value="blocked">Blocked Number / IP</option></select>
          <select value={period} onChange={e=>setPeriod(e.target.value)} style={inputStyle}><option value="1">Today</option><option value="2">Last 2 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select>
          <input value={ip} onChange={e=>setIp(e.target.value)} placeholder="Filter IP" style={inputStyle}/>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={inputStyle}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
          <select value={limit} onChange={e=>setLimit(Number(e.target.value))} style={inputStyle}><option value="100">100</option><option value="200">200</option><option value="500">500</option></select>
        </div>
      </Card>

      {error&&<div style={{marginTop:15,padding:14,borderRadius:12,background:"#fff1f2",color:"#be123c",fontWeight:700}}>{error}</div>}

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <div><h2 style={{margin:"0 0 4px",fontSize:18}}>IP Block Control</h2><div style={{fontSize:12,color:"#64748b"}}>Blocked IPs cannot initiate OTP requests.</div></div>
          <button onClick={()=>setShowBlockBox(v=>!v)} style={btnStyle(RED)}>{showBlockBox?"Cancel":"＋ Block IP"}</button>
        </div>
        {showBlockBox&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14,paddingTop:14,borderTop:"1px solid #eef2f7"}}>
          <input value={blockIp} onChange={e=>setBlockIp(e.target.value.trim())} placeholder="IP address to block" style={{...inputStyle,minWidth:210}}/>
          <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)" style={{...inputStyle,minWidth:240}}/>
          <button disabled={!blockIp.trim()||!!busyIp} onClick={()=>controlIp(blockIp.trim(),"block_ip")} style={btnStyle(RED)}>{busyIp===blockIp.trim()?"Blocking…":"Block IP"}</button>
        </div>}
        <div style={{marginTop:14,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:720}}>
            <thead><tr>{["IP address","Reason","Type","Blocked at","Action"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead>
            <tbody>
              {!data.blockedIps?.length?<tr><td colSpan={5} style={empty}>No blocked IPs.</td></tr>:
              data.blockedIps.map(x=><tr key={x.id}>
                <td style={td}><code>{x.ip_address}</code></td>
                <td style={td}>{x.reason||"—"}</td>
                <td style={td}><Badge tone="red">{x.is_permanent?"Permanent":"Temporary"}</Badge></td>
                <td style={td}>{fmt(x.created_at)}</td>
                <td style={td}><button disabled={busyIp===x.ip_address} onClick={()=>controlIp(x.ip_address,"unblock_ip")} style={btnStyle("#0f172a")}>{busyIp===x.ip_address?"Working…":"Unblock"}</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(300px,1fr)",gap:18,marginTop:18}}>
        <Card>
          <h2 style={{margin:"0 0 14px",fontSize:18}}>OTP Requests</h2>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:950}}>
            <thead><tr>{["Phone","Flow","Exact date & time","IP address","Status","Attempts","IP control"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead>
            <tbody>
              {loading?<tr><td colSpan={7} style={empty}>Loading…</td></tr>:!data.requests.length?<tr><td colSpan={7} style={empty}>No OTP requests found.</td></tr>:
              data.requests.map(x=><tr key={x.id}>
                <td style={td}><b>{x.phone}</b></td>
                <td style={td}><Badge tone={x.flow==="login"?"blue":"orange"}>{String(x.flow||"").toUpperCase()}</Badge></td>
                <td style={td}>{fmt(x.created_at)}</td>
                <td style={td}><code>{x.ip_address||"Not recorded"}</code></td>
                <td style={td}><Badge tone={x.status==="verified"?"green":x.status==="expired"?"orange":x.status==="failed"?"red":"blue"}>{x.status}</Badge></td>
                <td style={td}>{x.attempts??0}</td>
                <td style={td}>{x.ip_address&&!blockedSet.has(x.ip_address)?<button disabled={busyIp===x.ip_address} onClick={()=>controlIp(x.ip_address,"block_ip")} style={btnStyle(RED)}>{busyIp===x.ip_address?"Blocking…":"Block IP"}</button>:x.ip_address?<button disabled={busyIp===x.ip_address} onClick={()=>controlIp(x.ip_address,"unblock_ip")} style={btnStyle("#0f172a")}>{busyIp===x.ip_address?"Working…":"Unblock IP"}</button>:<span style={{color:"#94a3b8"}}>—</span>}</td>
              </tr>)}
            </tbody>
          </table></div>
        </Card>

        <div style={{display:"grid",gap:18}}>
          <Card><h2 style={{margin:"0 0 12px",fontSize:18}}>Most OTP Initiated</h2>{!data.phoneRanking.length?<div style={empty}>No data.</div>:data.phoneRanking.slice(0,20).map((x,i)=><div key={x.phone} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #eef2f7"}}><span><b style={{width:28,display:"inline-block"}}>#{i+1}</b>{x.phone}</span><b style={{color:i===0?RED:"#0f172a"}}>{x.count}</b></div>)}</Card>
          <Card><h2 style={{margin:"0 0 12px",fontSize:18}}>Most Active IPs</h2>{!data.ipRanking.length?<div style={empty}>No data.</div>:data.ipRanking.slice(0,15).map((x,i)=><div key={x.ip} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #eef2f7"}}><span><b style={{width:28,display:"inline-block"}}>#{i+1}</b><code>{x.ip}</code></span><b>{x.count}</b></div>)}</Card>
        </div>
      </div>
    </main>;
}

const inputStyle={height:42,border:"1px solid #dbe2ea",borderRadius:11,padding:"0 12px",background:"#fff",color:"#0f172a",outline:"none"};
const btnStyle=(background)=>({border:0,borderRadius:10,background,color:"#fff",padding:"9px 13px",fontWeight:800,cursor:"pointer"});
const th={textAlign:"left",padding:"11px 10px",fontSize:11,color:"#64748b",borderBottom:"1px solid #e8edf3",whiteSpace:"nowrap"};
const td={padding:"12px 10px",borderBottom:"1px solid #eef2f7",fontSize:13,whiteSpace:"nowrap"};
const empty={padding:28,textAlign:"center",color:"#94a3b8"};
