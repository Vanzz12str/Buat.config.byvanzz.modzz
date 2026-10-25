import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "vanzz-modz-users";
const OWNER_NAME = "Vanzz Owner";
const ROLES = ["Member", "Reseller", "Partner", "Owner"];
const COOKIE = "vanzz_session";
const SESSION_SECONDS = 8 * 60 * 60;

function store() { return getStore(STORE_NAME); }
function secret() {
  const s = process.env.NETLIFY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Set NETLIFY_SESSION_SECRET (minimal 32 karakter) di environment variables Netlify.");
  return s;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function verifyPassword(password, stored) {
  try { const a=crypto.scryptSync(password,stored.salt,64), b=Buffer.from(stored.hash,"hex"); return a.length===b.length && crypto.timingSafeEqual(a,b); }
  catch { return false; }
}
function publicUser(u) { return {id:u.id,username:u.username,role:u.role,blocked:!!u.blocked,createdAt:u.createdAt,isPrimaryOwner:!!u.isPrimaryOwner}; }
async function loadUsers() {
  const s=store(); let users=await s.get("users.json",{type:"json"});
  if (!Array.isArray(users)) {
    users=[];
    users.push({id:crypto.randomUUID(),username:OWNER_NAME,role:"Owner",blocked:false,createdAt:new Date().toISOString(),password:hashPassword("HARTONO FAMILY"),isPrimaryOwner:true});
    await s.setJSON("users.json",users);
  } else if (!users.some(u=>u.username.toLowerCase()===OWNER_NAME.toLowerCase())) {
    users.push({id:crypto.randomUUID(),username:OWNER_NAME,role:"Owner",blocked:false,createdAt:new Date().toISOString(),password:hashPassword("HARTONO FAMILY"),isPrimaryOwner:true});
    await s.setJSON("users.json",users);
  }
  return users;
}
async function saveUsers(users) { await store().setJSON("users.json",users); }
function signSession(userId, exp) {
  const payload=Buffer.from(JSON.stringify({sub:userId,exp})).toString("base64url");
  const sig=crypto.createHmac("sha256",secret()).update(payload).digest("base64url");
  return payload+"."+sig;
}
function readSession(event) {
  const raw=event.headers?.cookie||event.headers?.Cookie||"";
  const part=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  if(!part)return null;
  try {
    const token=decodeURIComponent(part.slice(COOKIE.length+1)); const [payload,sig]=token.split(".");
    const expected=crypto.createHmac("sha256",secret()).update(payload).digest(); const actual=Buffer.from(sig,"base64url");
    if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return null;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString());
    if(!data.sub||data.exp<Date.now()/1000)return null; return data.sub;
  } catch { return null; }
}
function response(statusCode, data, headers={}) { return {statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers},body:JSON.stringify(data)}; }
function cookie(token,maxAge=SESSION_SECONDS) { return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`; }
function readBody(event) { try { return event.body ? JSON.parse(event.isBase64Encoded?Buffer.from(event.body,"base64").toString():event.body) : {}; } catch { return null; } }
function validUsername(name) { return typeof name==="string"&&name.trim().length>=3&&name.trim().length<=50&&/^[\p{L}\p{N} _.-]+$/u.test(name.trim()); }

export default async (event) => {
  try {
    let path=(event.path||new URL(event.rawUrl).pathname).replace(/^\/.netlify\/functions\/api/,"") || "/";
    // Netlify rewrites may expose either the original /api/... path or the function's /... path.
    if(path !== "/api" && !path.startsWith("/api/")) path = "/api" + (path === "/" ? "" : path);
    const method=event.httpMethod||"GET";
    if(method==="GET"&&(path==="/api/health"||path==="/health"))return response(200,{ok:true,name:"VANZZ MODZ"});
    let users=await loadUsers();
    if(method==="POST"&&path==="/api/login") {
      const b=readBody(event); if(!b)return response(400,{error:"Data login tidak valid."});
      const name=String(b.username||"").trim(),pass=String(b.password||"");
      const u=users.find(x=>x.username.toLowerCase()===name.toLowerCase());
      if(!u||!verifyPassword(pass,u.password)||u.blocked)return response(401,{error:"Username atau password salah, atau akun diblokir."});
      const token=signSession(u.id,Math.floor(Date.now()/1000)+SESSION_SECONDS);
      return response(200,{user:publicUser(u),userCount:users.length},{"Set-Cookie":cookie(token)});
    }
    if(method==="POST"&&path==="/api/logout")return response(200,{ok:true},{"Set-Cookie":cookie("",0)});
    const id=readSession(event);
    const me=id?users.find(u=>u.id===id&&!u.blocked):null;
    if(method==="POST"&&path==="/api/password") {
      if(!me)return response(401,{error:"Silakan login terlebih dahulu."});
      const b=readBody(event);if(!b)return response(400,{error:"Data password tidak valid."});
      if(!verifyPassword(String(b.oldPassword||""),me.password))return response(400,{error:"Password sekarang tidak cocok."});
      const next=String(b.newPassword||"");if(next.length<8||next.length>200)return response(400,{error:"Password baru harus 8–200 karakter."});
      me.password=hashPassword(next);await saveUsers(users);return response(200,{ok:true});
    }
    if(!path.startsWith("/api/"))return response(404,{error:"Endpoint tidak ditemukan."});
    if(!me)return response(401,{error:"Silakan login terlebih dahulu."});
    if(method==="GET"&&path==="/api/me")return response(200,{user:publicUser(me),userCount:users.length});
    if(method==="POST"&&path==="/api/users") {
      const b=readBody(event);if(!b)return response(400,{error:"Data akun tidak valid."});
      const username=String(b.username||"").trim(),password=String(b.password||""),role=String(b.role||"");
      if(!validUsername(username))return response(400,{error:"Username 3–50 karakter; gunakan huruf, angka, spasi, titik, _ atau -."});
      if(password.length<8||password.length>200)return response(400,{error:"Password harus 8–200 karakter."});
      if(!ROLES.includes(role))return response(400,{error:"Role tidak valid."});
      const allowed=me.role==="Owner"?ROLES:me.role==="Partner"?["Member","Reseller"]:me.role==="Reseller"?["Member"]:[];
      if(!allowed.includes(role))return response(403,{error:"Role kamu tidak diizinkan membuat akun dengan role tersebut."});
      if(username.toLowerCase()===OWNER_NAME.toLowerCase())return response(409,{error:"Username tersebut khusus untuk Owner utama."});
      if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return response(409,{error:"Username sudah digunakan."});
      const u={id:crypto.randomUUID(),username,role,blocked:false,createdAt:new Date().toISOString(),password:hashPassword(password),isPrimaryOwner:false};
      users.push(u);await saveUsers(users);return response(201,{user:publicUser(u)});
    }
    if(method==="GET"&&path==="/api/users") {
      if(me.role!=="Owner")return response(403,{error:"Hanya Owner yang dapat melihat seluruh akun."});
      return response(200,{users:users.map(publicUser)});
    }
    const match=path.match(/^\/api\/users\/([\w-]+)\/(block|role)$/);
    if(match&&method==="PATCH") {
      if(me.role!=="Owner")return response(403,{error:"Hanya Owner yang dapat mengubah status atau role akun."});
      const target=users.find(u=>u.id===match[1]);if(!target)return response(404,{error:"Akun tidak ditemukan."});
      if(target.isPrimaryOwner)return response(403,{error:"Akun Owner utama dilindungi."});
      const b=readBody(event);if(!b)return response(400,{error:"Data tidak valid."});
      if(match[2]==="block"){if(typeof b.blocked!=="boolean")return response(400,{error:"Status blokir tidak valid."});target.blocked=b.blocked;}
      else {if(!ROLES.includes(b.role))return response(400,{error:"Role tidak valid."});target.role=b.role;}
      await saveUsers(users);return response(200,{user:publicUser(target)});
    }
    return response(404,{error:"Endpoint tidak ditemukan."});
  } catch (err) {
    console.error("VANZZ API error:",err?.message||err);
    return response(500,{error:"Server error. Pastikan NETLIFY_SESSION_SECRET sudah diatur di Site configuration > Environment variables."});
  }
};
