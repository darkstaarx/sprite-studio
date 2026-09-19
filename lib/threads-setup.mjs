// Sambungan Threads tanpa perlu server HTTPS.
//
// Meta wajibkan redirect URI berbentuk HTTPS, jadi callback ke http://localhost ditolak.
// Penyelesaiannya: biarkan Meta redirect ke URL HTTPS yang tak wujud, kemudian pengguna
// salin URL dari bar alamat dan tampal di sini. Kod kebenaran ada dalam URL tersebut.
const OAUTH_BASE = process.env.THREADS_OAUTH_BASE || "https://threads.net";
const GRAPH_BASE = process.env.THREADS_GRAPH_BASE || "https://graph.threads.net";
const SCOPES = "threads_basic,threads_content_publish";

export function authorizeUrl({ appId, redirectUri }) {
  if (!appId) throw new Error("App ID belum diisi.");
  if (!redirectUri) throw new Error("Redirect URI belum diisi.");
  if (!/^https:\/\//i.test(redirectUri)) throw new Error("Meta hanya terima redirect URI yang bermula dengan https://");
  // Threads menolak localhost dan alamat IP tempatan, walaupun https.
  if (/^https:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(redirectUri)) {
    throw new Error("Threads tak terima localhost sebagai redirect URI. Guna domain lain — contoh https://viralcool.invalid/callback (ia memang tak wujud, dan itu tak mengapa).");
  }
  const u = new URL("/oauth/authorize", OAUTH_BASE);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

/** Terima kod mentah, atau URL penuh yang disalin dari bar alamat. */
export function extractCode(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Tampal kod atau URL yang kau nampak selepas approve.");

  // Meta menolak? Beritahu sebabnya, walaupun pengguna tampal separuh URL sahaja.
  const err = raw.match(/[?&#]error_description=([^&\s#]+)/) || raw.match(/[?&#]error=([^&\s#]+)/);
  if (err) throw new Error(`Meta tolak kebenaran: ${decodeURIComponent(err[1]).replace(/\+/g, " ")}`);

  // Terima URL penuh, potongan URL, "code=...", atau kod mentah — tanpa kira di mana ia berada.
  const inUrl = raw.match(/[?&#]code=([^&\s#]+)/) || raw.match(/^code=([^&\s#]+)/i);
  const code = inUrl ? inUrl[1] : (/^https?:\/\//i.test(raw) ? "" : raw.split(/\s+/)[0]);
  const clean = decodeURIComponent(code || "").replace(/#_+$/, "").trim();

  if (!clean) throw new Error("Tak jumpa kod dalam apa yang kau tampal. Salin keseluruhan URL dari bar alamat selepas kau tekan Approve — ia ada bahagian ?code=");
  if (clean.length < 20) throw new Error(`"${clean}" nampak terlalu pendek untuk jadi kod kebenaran. Salin URL penuh dari bar alamat.`);
  return clean;
}

async function post(url, form) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error_message || body?.error?.message || `Meta balas ${res.status}`);
  return body;
}
async function get(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Meta balas ${res.status}`);
  return body;
}

/** Kod -> token pendek -> token 60 hari -> maklumat akaun. */
export async function exchange({ appId, appSecret, redirectUri, code }) {
  if (!appId || !appSecret) throw new Error("App ID dan App Secret wajib diisi dulu.");
  const short = await post(`${GRAPH_BASE}/oauth/access_token`, {
    client_id: appId, client_secret: appSecret,
    grant_type: "authorization_code", redirect_uri: redirectUri, code,
  });
  if (!short.access_token) throw new Error("Meta tak pulangkan access token.");

  let token = short.access_token, expiresIn = 3600;
  try {
    const long = await get(`${GRAPH_BASE}/access_token?grant_type=th_exchange_token`
      + `&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(short.access_token)}`);
    if (long.access_token) { token = long.access_token; expiresIn = long.expires_in || 5184000; }
  } catch { /* token pendek masih boleh pakai sejam */ }

  const me = await get(`${GRAPH_BASE}/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  if (!me.id) throw new Error("Tak dapat baca akaun Threads dengan token tu.");
  return {
    token, expiresAt: Date.now() + expiresIn * 1000,
    userId: me.id, username: me.username || "",
    shortLived: expiresIn <= 3600,
  };
}
