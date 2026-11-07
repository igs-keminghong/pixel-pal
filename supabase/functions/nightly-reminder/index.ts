// @ts-nocheck
// Paste this whole file into Supabase → Edge Functions → nightly-reminder
// Minimal Web Push sender (RFC 8291 aes128gcm + RFC 8292 VAPID) using only WebCrypto.
// Works in Deno (Supabase Edge Functions) and Node 18+.
const te = new TextEncoder();
function b64uToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64u(b) {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

// Encrypt `payload` (string) for a subscription's p256dh / auth keys. Returns the request body.
async function encryptPayload(payload, p256dhB64u, authB64u) {
  const uaPublic = b64uToBytes(p256dhB64u);
  const authSecret = b64uToBytes(authB64u);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(te.encode(payload), new Uint8Array([2])); // single, last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// VAPID Authorization header value for an endpoint.
async function vapidAuth(endpoint, publicB64u, privateB64u, subject) {
  const pub = b64uToBytes(publicB64u);
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), d: privateB64u, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o) => bytesToB64u(te.encode(JSON.stringify(o)));
  const unsigned = enc({ typ: "JWT", alg: "ES256" }) + "." +
    enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64u(sig)}, k=${publicB64u}`;
}

// Send one push. Returns the HTTP status (201 = accepted, 404/410 = subscription gone).
async function sendPush(sub, payload, vapid) {
  const body = await encryptPayload(payload, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": await vapidAuth(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "43200",
      "Urgency": "normal",
    },
    body,
  });
  return res.status;
}

// ---------------------------------------------------------------------------
// 像素行程夥伴 · nightly-reminder
// Called every 15 minutes by pg_cron (header x-cron-secret), or by a signed-in
// user from Settings → 「傳一則測試通知」 (body {"test":true}).
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// Provided by Supabase automatically: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------------------
const env = (k: string) => Deno.env.get(k) || "";
const SB_URL = env("SUPABASE_URL");
// Prefer a secret key you add yourself (SB_SECRET_KEY = sb_secret_...), fall back to the built-in service-role key
const SERVICE_KEY = env("SB_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY");
const keyHeaders = (k: string) => (k.startsWith("eyJ") ? { apikey: k, Authorization: "Bearer " + k } : { apikey: k });
const VAPID = { publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY"), subject: env("VAPID_SUBJECT") || "mailto:pixel-pal@example.com" };
const WINDOW_MIN = 15;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    ...init,
    headers: { ...keyHeaders(SERVICE_KEY), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`REST ${path.split("?")[0]} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

// ---- time zone helpers -----------------------------------------------------
function partsIn(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, date: `${p.year}-${p.month}-${p.day}` };
}
function offsetMin(tz: string, at: Date) { // minutes ahead of UTC
  const p = partsIn(tz, at);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - at.getTime()) / 60000);
}
function localMidnightUTC(tz: string, y: number, m: number, d: number) {
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMin(tz, guess) * 60000);
}
const hhmm = (tz: string, iso: string) => { const p = partsIn(tz, new Date(iso)); return String(p.h).padStart(2, "0") + ":" + String(p.mi).padStart(2, "0"); };

// ---- message ---------------------------------------------------------------
function message(profile: any, events: any[], tz: string, test: boolean) {
  const name = profile.pet_name || "夥伴";
  const n = events.length, f = events[0];
  const first = f ? `${f.all_day ? "整天" : hhmm(tz, f.starts_at)}「${f.title}」` : "";
  let body: string;
  if (test) {
    const t = String(profile.remind_time || "21:00").slice(0, 5);
    body = profile.pet === "cat" ? `……咦？你叫我嗎？喔對，今晚 ${t} 要提醒你。`
      : profile.pet === "parrot" ? `我在這裡！我在這裡！今晚 ${t} 提醒你！啾！`
      : profile.pet === "beagle" ? `汪！我在這裡喔！今晚 ${t} 會來提醒你明天的行程！`
      : `……我在啦。今晚 ${t} 會提醒你，別睡著了。`;
    return { title: `${name} 來打招呼了`, body, icon: `assets/${profile.pet || "shiba"}_happy.png`, tag: "hello", url: "./" };
  }
  if (profile.pet === "cat") body = n ? `……咦？明天好像有 ${n} 件事。第一件是 ${first}……吧？` : "明天……沒事？那就一起睡到中午吧。";
  else if (profile.pet === "parrot") body = n ? `明天！明天！${n} 件事！第一件 ${first}！啾！` : "明天放假！放假！啾啾！";
  else if (profile.pet === "beagle") body = n ? `嗅嗅！明天有 ${n} 個行程，先去 ${first}！早點睡喔！` : "明天沒有行程耶！可以睡晚一點～";
  else body = n ? `哼，明天 ${n} 件事。第一件是 ${first}，早點睡。` : "明天沒事。那我也要放空。";
  return {
    title: `${name} 提醒你明天的行程`,
    body,
    icon: `assets/${profile.pet || "shiba"}_alert.png`,
    tag: "nightly-reminder",
    url: "./",
  };
}

async function remind(profile: any, subs: any[], test = false) {
  const tz = profile.timezone || "Asia/Taipei";
  const now = partsIn(tz);
  const t0 = localMidnightUTC(tz, now.y, now.m, now.d + 1);
  const t1 = localMidnightUTC(tz, now.y, now.m, now.d + 2);
  const events = await rest(`events?select=starts_at,title,all_day&user_id=eq.${profile.id}` +
    `&starts_at=gte.${encodeURIComponent(t0.toISOString())}&starts_at=lt.${encodeURIComponent(t1.toISOString())}&order=starts_at`);
  const payload = JSON.stringify(message(profile, events || [], tz, test));
  let sent = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(s, payload, VAPID);
      if (status === 404 || status === 410) await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
      else if (status >= 200 && status < 300) sent++;
      else console.log("push failed", status, s.endpoint.slice(0, 60));
    } catch (e) { console.log("push error", String(e)); }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const missing = [!SERVICE_KEY && "SERVICE KEY", !VAPID.publicKey && "VAPID_PUBLIC_KEY", !VAPID.privateKey && "VAPID_PRIVATE_KEY", !env("CRON_SECRET") && "CRON_SECRET"].filter(Boolean);
  if (missing.length) return json({ error: "missing secrets: " + missing.join(", ") }, 500);
  const body = await req.json().catch(() => ({}));
  try {
    // ---- test from the app: only to the signed-in user --------------------
    if (body.test) {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + token } });
      if (!u.ok) console.log("auth check", u.status, await u.clone().text());
      if (!u.ok) return json({ error: "not signed in" }, 401);
      const user = await u.json();
      const [profile] = await rest(`profiles?select=id,pet,pet_name,remind_time,timezone&id=eq.${user.id}`);
      const subs = await rest(`push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${user.id}`);
      if (!profile || !subs.length) return json({ sent: 0, reason: "no subscription" });
      return json({ sent: await remind(profile, subs, true) });
    }
    // ---- scheduled run -----------------------------------------------------
    if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    const subs = await rest("push_subscriptions?select=user_id,endpoint,p256dh,auth");
    const byUser: Record<string, any[]> = {};
    for (const s of subs) (byUser[s.user_id] ||= []).push(s);
    const ids = Object.keys(byUser);
    if (!ids.length) return json({ due: 0, sent: 0 });
    const profiles = await rest(`profiles?select=id,pet,pet_name,remind_time,timezone,last_reminded_on&id=in.(${ids.join(",")})`);
    let due = 0, sent = 0;
    for (const p of profiles) {
      const tz = p.timezone || "Asia/Taipei";
      const now = partsIn(tz);
      const [rh, rm] = String(p.remind_time || "21:00").split(":").map(Number);
      const mins = now.h * 60 + now.mi, target = rh * 60 + rm;
      if (mins < target || mins >= target + WINDOW_MIN || p.last_reminded_on === now.date) continue;
      due++;
      sent += await remind(p, byUser[p.id]);
      await rest(`profiles?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ last_reminded_on: now.date }) });
    }
    return json({ due, sent });
  } catch (e) {
    console.log(String(e));
    return json({ error: String(e) }, 500);
  }
});
