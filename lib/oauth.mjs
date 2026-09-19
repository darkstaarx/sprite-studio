// OAuth untuk Threads dan Meta (Facebook Page + Instagram Business).
// Laluan ni optional: kau boleh tampal access token terus dalam UI kalau tak nak daftar app.
import { rid } from "./store.mjs";

const GRAPH = process.env.META_GRAPH_VERSION || "v21.0";
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "http://localhost:8787").replace(/\/+$/, "");
const redirect = kind => `${PUBLIC_URL()}/oauth/${kind}/callback`;

export const oauthReady = kind => kind === "threads"
  ? Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET)
  : Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);

export function startUrl(kind) {
  if (!oauthReady(kind)) throw new Error(`Set ${kind === "threads" ? "THREADS_APP_ID/SECRET" : "META_APP_ID/SECRET"} dalam .env dulu.`);
  if (kind === "threads") {
    const u = new URL("https://threads.net/oauth/authorize");
    u.searchParams.set("client_id", process.env.THREADS_APP_ID);
    u.searchParams.set("redirect_uri", redirect("threads"));
    u.searchParams.set("scope", "threads_basic,threads_content_publish");
    u.searchParams.set("response_type", "code");
    return u.toString();
  }
  const u = new URL(`https://www.facebook.com/${GRAPH}/dialog/oauth`);
  u.searchParams.set("client_id", process.env.META_APP_ID);
  u.searchParams.set("redirect_uri", redirect("meta"));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", [
    "pages_show_list", "pages_manage_posts", "pages_read_engagement",
    "instagram_basic", "instagram_content_publish", "business_management",
  ].join(","));
  return u.toString();
}

async function json(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body?.error?.message || JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Tukar code jadi akaun sedia simpan. Balik array akaun. */
export async function handleCallback(kind, code) {
  if (kind === "threads") {
    const form = new URLSearchParams({
      client_id: process.env.THREADS_APP_ID,
      client_secret: process.env.THREADS_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: redirect("threads"),
      code,
    });
    const short = await json("https://graph.threads.net/oauth/access_token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form,
    });
    const long = await json(`https://graph.threads.net/access_token?grant_type=th_exchange_token`
      + `&client_secret=${encodeURIComponent(process.env.THREADS_APP_SECRET)}`
      + `&access_token=${encodeURIComponent(short.access_token)}`);
    const me = await json(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(long.access_token)}`);
    return [{
      id: rid(), platform: "threads", label: `@${me.username}`, token: long.access_token,
      expiresAt: Date.now() + (long.expires_in || 5184000) * 1000,
      meta: { userId: me.id, username: me.username },
    }];
  }

  const tok = await json(`https://graph.facebook.com/${GRAPH}/oauth/access_token`
    + `?client_id=${encodeURIComponent(process.env.META_APP_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirect("meta"))}`
    + `&client_secret=${encodeURIComponent(process.env.META_APP_SECRET)}`
    + `&code=${encodeURIComponent(code)}`);
  const long = await json(`https://graph.facebook.com/${GRAPH}/oauth/access_token`
    + `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(process.env.META_APP_ID)}`
    + `&client_secret=${encodeURIComponent(process.env.META_APP_SECRET)}`
    + `&fb_exchange_token=${encodeURIComponent(tok.access_token)}`);
  const pages = await json(`https://graph.facebook.com/${GRAPH}/me/accounts`
    + `?fields=id,name,access_token,instagram_business_account{id,username}`
    + `&access_token=${encodeURIComponent(long.access_token)}`);

  const accounts = [];
  for (const page of pages.data || []) {
    accounts.push({
      id: rid(), platform: "facebook", label: page.name, token: page.access_token,
      expiresAt: null, meta: { pageId: page.id },
    });
    if (page.instagram_business_account) {
      accounts.push({
        id: rid(), platform: "instagram",
        label: "@" + (page.instagram_business_account.username || page.name),
        token: page.access_token, expiresAt: null,
        meta: { igUserId: page.instagram_business_account.id, username: page.instagram_business_account.username, pageId: page.id },
      });
    }
  }
  if (!accounts.length) throw new Error("Tiada Page dijumpai. Pastikan akaun kau admin pada sekurang-kurangnya satu Facebook Page.");
  return accounts;
}
