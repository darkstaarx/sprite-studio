// Adapter penerbit. Setiap satu: publish(post, account, opts) -> {remoteId, url}
// Rujukan API ditulis di atas setiap adapter supaya senang disemak bila Meta/TikTok tukar versi.
const GRAPH = process.env.META_GRAPH_VERSION || "v21.0";
const FB = `https://graph.facebook.com/${GRAPH}`;
const TH = "https://graph.threads.net/v1.0";
const TT = "https://open.tiktokapis.com/v2";

async function call(url, { method = "POST", params, json, token, headers } = {}) {
  const u = new URL(url);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  const init = { method, headers: { accept: "application/json", ...(headers || {}) } };
  if (json) { init.body = JSON.stringify(json); init.headers["content-type"] = "application/json"; }
  if (token) init.headers.authorization = "Bearer " + token;
  const res = await fetch(u, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error?.message_detail || body?.error_description || body?.raw || text;
    throw new Error(`${res.status} ${String(msg).slice(0, 400)}`);
  }
  return body;
}

const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Threads: /{user-id}/threads  ->  /{user-id}/threads_publish
async function threads(post, account) {
  const uid = account.meta?.userId;
  need(account.token && uid, "Akaun Threads tiada token atau userId.");
  const media = post.mediaUrls?.[0];
  const isVideo = media && /\.(mp4|mov|m4v)(\?|$)/i.test(media);
  const create = await call(`${TH}/${uid}/threads`, {
    params: {
      media_type: media ? (isVideo ? "VIDEO" : "IMAGE") : "TEXT",
      text: post.text,
      image_url: media && !isVideo ? media : undefined,
      video_url: media && isVideo ? media : undefined,
      access_token: account.token,
    },
  });
  if (media) await sleep(5000); // kontena media perlu masa siap
  const pub = await call(`${TH}/${uid}/threads_publish`, {
    params: { creation_id: create.id, access_token: account.token },
  });
  return { remoteId: pub.id, url: `https://www.threads.net/@${account.meta?.username || ""}` };
}

// --- Facebook Page: /{page-id}/feed (atau /photos kalau ada gambar)
async function facebook(post, account) {
  const pageId = account.meta?.pageId;
  need(account.token && pageId, "Akaun Facebook tiada Page token atau pageId.");
  const media = post.mediaUrls?.[0];
  const r = media
    ? await call(`${FB}/${pageId}/photos`, { params: { url: media, caption: post.text, access_token: account.token } })
    : await call(`${FB}/${pageId}/feed`, { params: { message: post.text, access_token: account.token } });
  const id = r.post_id || r.id;
  return { remoteId: id, url: `https://facebook.com/${id}` };
}

// --- Instagram: /{ig-user-id}/media -> tunggu FINISHED -> /media_publish
async function instagram(post, account) {
  const igId = account.meta?.igUserId;
  need(account.token && igId, "Akaun Instagram tiada token atau igUserId.");
  const media = post.mediaUrls?.[0];
  need(media, "Instagram wajib ada gambar atau video (URL awam).");
  const isVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(media);
  const create = await call(`${FB}/${igId}/media`, {
    params: {
      caption: post.text,
      ...(isVideo ? { media_type: "REELS", video_url: media } : { image_url: media }),
      access_token: account.token,
    },
  });
  for (let i = 0; i < 20; i++) {
    const s = await call(`${FB}/${create.id}`, { method: "GET", params: { fields: "status_code", access_token: account.token } });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") throw new Error("Kontena media Instagram gagal diproses.");
    await sleep(3000);
  }
  const pub = await call(`${FB}/${igId}/media_publish`, { params: { creation_id: create.id, access_token: account.token } });
  return { remoteId: pub.id, url: `https://instagram.com/${account.meta?.username || ""}` };
}

// --- TikTok Content Posting API. Default: hantar ke inbox (draf dalam app).
// Direct post perlu app yang dah diaudit + scope video.publish.
async function tiktok(post, account) {
  need(account.token, "Akaun TikTok tiada access token.");
  const media = post.mediaUrls?.[0];
  need(media, "TikTok wajib ada URL video awam (PULL_FROM_URL).");
  const direct = account.meta?.directPost === true;
  const endpoint = direct ? `${TT}/post/publish/video/init/` : `${TT}/post/publish/inbox/video/init/`;
  const json = {
    source_info: { source: "PULL_FROM_URL", video_url: media },
    ...(direct ? { post_info: { title: post.text.slice(0, 2200), privacy_level: account.meta?.privacy || "SELF_ONLY", disable_comment: false } } : {}),
  };
  const r = await call(endpoint, { json, token: account.token });
  const id = r.data?.publish_id;
  need(id, "TikTok tak pulangkan publish_id.");
  return { remoteId: id, url: "https://www.tiktok.com/tiktokstudio/content", note: direct ? "direct post" : "masuk inbox/draf TikTok" };
}

// --- Manual: tiada API. Tandakan siap + (optional) ping webhook kau.
async function manual(post, account) {
  const hook = account?.meta?.webhook || process.env.VIRALCOOL_WEBHOOK;
  if (hook) {
    await fetch(hook, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "ViralCool: masa post", platform: post.platform, text: post.text, media: post.mediaUrls }),
    }).catch(() => {});
  }
  return { remoteId: "manual-" + post.id, url: null, note: "tandakan manual — salin dan post sendiri" };
}

const ADAPTERS = { threads, facebook, instagram, tiktok, manual };

export async function publish(post, account, { dry = false } = {}) {
  const kind = account?.platform || post.platform || "manual";
  const fn = ADAPTERS[kind] || manual;
  if (dry) return { remoteId: `dry-${post.id}`, url: null, note: `dry-run (${kind})` };
  return fn(post, account || {});
}

/** Semak token masih hidup. Tiada panggilan yang menulis apa-apa. */
export async function verify(account) {
  try {
    if (account.platform === "threads") {
      const r = await call(`${TH}/${account.meta?.userId || "me"}`, { method: "GET", params: { fields: "id,username", access_token: account.token } });
      return { ok: true, info: r };
    }
    if (account.platform === "facebook") {
      const r = await call(`${FB}/${account.meta?.pageId}`, { method: "GET", params: { fields: "id,name", access_token: account.token } });
      return { ok: true, info: r };
    }
    if (account.platform === "instagram") {
      const r = await call(`${FB}/${account.meta?.igUserId}`, { method: "GET", params: { fields: "id,username", access_token: account.token } });
      return { ok: true, info: r };
    }
    if (account.platform === "tiktok") {
      const r = await call(`${TT}/user/info/?fields=open_id,display_name`, { method: "GET", token: account.token });
      return { ok: true, info: r.data?.user || r };
    }
    return { ok: true, info: { note: "manual — tiada token untuk disemak" } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
