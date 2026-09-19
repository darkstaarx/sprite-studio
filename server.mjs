#!/usr/bin/env node
// ViralCool — server tempatan: UI, API, enjin jadual, penerbit.
// Jalankan: node server.mjs   (buka http://localhost:8787)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, rid } from "./lib/store.mjs";
import { PLATFORMS } from "./lib/platforms.mjs";
import { ANGLES, generate, listPrompts, readPrompt, writePrompt, matchProducts, buildPromptFor, parsePosts } from "./lib/llm.mjs";
import * as sched from "./lib/scheduler.mjs";
import { verify } from "./lib/publishers.mjs";
import { detect } from "./lib/detect.mjs";
import { testLLM } from "./lib/llm-test.mjs";
import { startUrl, handleCallback, oauthReady } from "./lib/oauth.mjs";
import { authorizeUrl, extractCode, exchange } from "./lib/threads-setup.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(HERE, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const DRY = process.argv.includes("--dry") || process.env.VIRALCOOL_DRY === "1";
const TOKEN = process.env.VIRALCOOL_TOKEN || "";
const store = new Store(process.env.VIRALCOOL_DB || path.join(HERE, "data", "db.json"));

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* .env optional */ }
}

const send = (res, code, body, headers = {}) => {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(data);
};
const readBody = req => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", c => { raw += c; if (raw.length > 5e6) req.destroy(); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
  req.on("error", reject);
});
const mask = t => (t ? t.slice(0, 6) + "…" + t.slice(-4) : "");

function publicState() {
  const s = store.data.settings;
  return {
    settings: {
      ...s,
      llm: { ...s.llm, apiKey: s.llm.apiKey ? "__SET__" : "" },
      threads: { ...s.threads, appSecret: s.threads.appSecret ? "__SET__" : "" },
    },
    accounts: store.data.accounts.map(a => ({ ...a, token: mask(a.token) })),
    briefs: store.data.briefs,
    products: store.data.products,
    styles: STYLES,
    posts: store.data.posts.slice().sort((a, b) => (a.scheduledAt || a.createdAt) - (b.scheduledAt || b.createdAt)),
    logs: store.data.logs.slice(0, 60),
    platforms: PLATFORMS,
    angles: ANGLES,
    oauth: { threads: oauthReady("threads"), meta: oauthReady("meta") },
    dry: DRY,
    now: Date.now(),
  };
}

// Gaya tulisan yang pengguna pilih di muka depan -> angle dalam enjin.
const STYLES = {
  cerita:  { label: "Cerita sebenar",  angle: "cerita",       nota: "babak, dialog, butiran kecil" },
  jujur:   { label: "Review jujur",    angle: "review-jujur", nota: "termasuk satu kelemahan" },
  mitos:   { label: "Pecah mitos",     angle: "myth",         nota: "betulkan salah faham" },
  senarai: { label: "Senarai pendek",  angle: "listicle",     nota: "3-4 perkara laju" },
  soalan:  { label: "Soalan jujur",    angle: "soalan",       nota: "buka perbualan, tiada link" },
  harga:   { label: "Kiraan harga",    angle: "harga-shock",  nota: "perlu harga" },
};

/** Bina brief dari link atau produk dalam pustaka. Dikongsi oleh /compose dan /compose/prompt. */
async function briefDariBody(body) {
  const style = STYLES[body.style] ? body.style : "cerita";
  let product = body.productId ? store.data.products.find(p => p.id === body.productId) : null;
  let found = null;
  if (!product) {
    if (!body.url) return { error: "Bagi link produk atau pilih dari pustaka.", code: 400 };
    try { found = await detect(String(body.url)); }
    catch (e) { return { error: e.message, code: 502 }; }
    if (!found.hasName && !body.nama) {
      return { error: "Produk tak dapat dikesan. Isi nama sendiri.", code: 422, detected: found };
    }
    product = { url: found.affiliateUrl, name: body.nama || found.name, price: body.harga || found.price, image: found.image, marketplace: found.marketplace };
  }
  const brief = {
    id: rid(), name: product.name, mode: body.mode || "affiliate", nama: product.name,
    harga: product.price || body.harga || "", link: product.url, niche: product.marketplace || "",
    keterangan: found?.descriptionQuality === "produk" ? found.description : "",
    kelebihan: body.kelebihan || [], masalah: body.masalah || product.masalah || "",
    cerita: body.cerita || "", audience: body.audience || "pengguna media sosial Malaysia, 25-40",
    bahasa: "bm-santai", tone: "Santai & jujur", cta: "Link dalam balasan pertama",
    angles: [STYLES[style].angle], image: product.image, lastUsedAt: Date.now(),
  };
  return { brief, product, detected: found, style };
}

const ROUTES = [
  ["GET", /^\/api\/state$/, async () => [200, publicState()]],

  ["POST", /^\/api\/settings$/, async (_m, body) => {
    const s = store.data.settings;
    if (body.llm) {
      const { apiKey, ...rest } = body.llm;
      Object.assign(s.llm, rest);
      // Kalau pengguna tak nyatakan jenis API, teka dari ada tidaknya base URL —
      // tetapi pilihan yang dinyatakan secara jelas sentiasa menang.
      if (typeof body.llm.provider !== "string") {
        const adaBase = Boolean(String(s.llm.baseUrl || "").trim());
        s.llm.provider = adaBase ? (s.llm.provider === "local" ? "openai" : s.llm.provider) : "local";
      }
      if (apiKey && apiKey !== "__SET__") s.llm.apiKey = apiKey;
      if (apiKey === "") s.llm.apiKey = "";
    }
    if (body.autopilot) Object.assign(s.autopilot, body.autopilot);
    if (body.timezone) s.timezone = body.timezone;
    store.save();
    return [200, publicState()];
  }],

  // --- Uji enjin: satu panggilan kecil, dan betulkan base URL kalau perlu.
  ["POST", /^\/api\/llm\/test$/, async (_m, body) => {
    const cur = store.data.settings.llm;
    const cfg = {
      provider: body.provider || (body.baseUrl ? "openai" : cur.provider),
      baseUrl: body.baseUrl ?? cur.baseUrl,
      model: body.model ?? cur.model,
      apiKey: (body.apiKey && body.apiKey !== "__SET__") ? body.apiKey : cur.apiKey,
    };
    const r = await testLLM(cfg);
    if (r.ok && body.save !== false) {
      Object.assign(cur, { provider: cfg.provider, baseUrl: r.baseUrl, model: cfg.model });
      if (body.apiKey && body.apiKey !== "__SET__") cur.apiKey = body.apiKey;
      store.save();
      store.log("info", `Enjin ayat diuji dan disimpan: ${cfg.provider} ${cfg.model}`);
    }
    return [r.ok ? 200 : 502, { ...r, provider: cfg.provider, model: cfg.model }];
  }],

  ["GET", /^\/api\/prompts$/, async () => [200, { prompts: listPrompts() }]],
  ["GET", /^\/api\/prompts\/([a-z0-9-]{1,32})$/, async m => {
    try { return [200, { name: m[1], text: readPrompt(m[1]) }]; }
    catch (e) { return [400, { error: e.message }]; }
  }],
  ["POST", /^\/api\/prompts\/([a-z0-9-]{1,32})$/, async (m, body) => {
    if (typeof body.text !== "string" || body.text.length < 20) return [400, { error: "Teks terlalu pendek." }];
    try { writePrompt(m[1], body.text); } catch (e) { return [400, { error: e.message }]; }
    store.log("info", `Otak dikemas kini: ${m[1]}`);
    return [200, { ok: true }];
  }],

  ["POST", /^\/api\/briefs$/, async (_m, body) => {
    const b = { id: body.id || rid(), lastUsedAt: 0, ...body };
    const i = store.data.briefs.findIndex(x => x.id === b.id);
    if (i >= 0) store.data.briefs[i] = { ...store.data.briefs[i], ...b };
    else store.data.briefs.push(b);
    store.save();
    return [200, { brief: b }];
  }],
  ["DELETE", /^\/api\/briefs\/([\w-]+)$/, async m => {
    store.data.briefs = store.data.briefs.filter(b => b.id !== m[1]);
    store.save();
    return [200, { ok: true }];
  }],

  ["POST", /^\/api\/generate$/, async (_m, body) => {
    const brief = body.brief || store.data.briefs.find(b => b.id === body.briefId);
    if (!brief) return [400, { error: "Brief tak dijumpai." }];
    try {
      const out = await generate({
        settings: store.data.settings, brief,
        platforms: body.platforms?.length ? body.platforms : ["threads"],
        count: body.count || 3,
      });
      return [200, { posts: out.posts, provider: out.provider }];
    } catch (e) { return [502, { error: e.message }]; }
  }],

  ["POST", /^\/api\/posts$/, async (_m, body) => {
    const items = Array.isArray(body.posts) ? body.posts : [body];
    const slots = body.autoSlot ? sched.nextSlots(store, items.length) : [];
    const made = items.map((p, i) => store.addPost({
      platform: p.platform || "threads",
      accountId: p.accountId ?? store.accountFor(p.platform || "threads")?.id ?? null,
      text: p.text || p.caption || "",
      mediaUrls: p.mediaUrls || [],
      status: p.status || "review",
      scheduledAt: p.scheduledAt ?? slots[i] ?? null,
      source: p.source || "manual",
      briefId: p.briefId || null,
      script: p.script || (p.hook ? { angle: p.angle, hook: p.hook, body: p.body, cta: p.cta, broll: p.broll, reply: p.reply, visual: p.visual } : null),
    }));
    return [200, { posts: made }];
  }],
  ["PATCH", /^\/api\/posts\/([\w-]+)$/, async (m, body) => {
    const allowed = ["platform", "accountId", "text", "mediaUrls", "status", "scheduledAt", "script"];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    if (patch.status === "scheduled") { patch.attempts = 0; patch.error = null; }
    const p = store.updatePost(m[1], patch);
    return p ? [200, { post: p }] : [404, { error: "Post tak dijumpai." }];
  }],
  ["DELETE", /^\/api\/posts\/([\w-]+)$/, async m =>
    store.removePost(m[1]) ? [200, { ok: true }] : [404, { error: "Post tak dijumpai." }]],
  ["POST", /^\/api\/posts\/([\w-]+)\/publish$/, async m => {
    const p = store.updatePost(m[1], { status: "scheduled", scheduledAt: Date.now() - 1000, attempts: 0, error: null });
    if (!p) return [404, { error: "Post tak dijumpai." }];
    const [r] = await sched.tick(store, { dry: DRY });
    return [200, { result: r, post: store.data.posts.find(x => x.id === m[1]) }];
  }],

  // Kesan produk dari link sahaja (tanpa jana apa-apa).
  ["POST", /^\/api\/detect$/, async (_m, body) => {
    if (!body.url) return [400, { error: "Bagi link produk." }];
    try { return [200, await detect(String(body.url), { debug: body.debug === true })]; }
    catch (e) { return [502, { error: e.message }]; }
  }],

  // Aliran affiliate satu tekan: link -> kesan -> tulis ayat -> jadual.
  ["POST", /^\/api\/quick$/, async (_m, body) => {
    if (!body.url) return [400, { error: "Bagi link produk." }];
    let found;
    try { found = await detect(String(body.url)); }
    catch (e) { return [502, { error: `Gagal kesan produk: ${e.message}` }]; }
    if (!found.hasName && !body.nama) {
      return [422, { error: "Produk tak dapat dikesan dari link ni. Isi nama produk sendiri, lepas tu cuba lagi.", detected: found }];
    }

    const brief = {
      id: rid(),
      name: body.nama || found.name,
      mode: body.mode || "affiliate",
      nama: body.nama || found.name,
      harga: body.harga || found.price,
      link: found.affiliateUrl,
      niche: body.niche || found.marketplace,
      keterangan: found.description,
      kelebihan: body.kelebihan || [],
      masalah: body.masalah || "",
      bukti: body.bukti || "",
      audience: body.audience || "pengguna media sosial Malaysia, 25-40",
      bahasa: body.bahasa || "bm-santai",
      tone: body.tone || "Santai & jujur",
      cta: body.cta || "Link dalam balasan pertama",
      // Tanpa harga, angle kiraan harga akan memaksa model mereka nombor — jadi ia digugurkan.
      angles: body.angles?.length ? body.angles
        : ["review-jujur", "masalah-selesai", "harga-shock", "objection", "soalan"]
            .filter(a => a !== "harga-shock" || Boolean(body.harga || found.price)),
      image: found.image,
      lastUsedAt: Date.now(),
    };
    if (body.saveBrief !== false) { store.data.briefs.push(brief); store.save(); }

    const platforms = body.platforms?.length ? body.platforms : ["threads"];
    let posts;
    try {
      ({ posts } = await generate({ settings: store.data.settings, brief, platforms, count: body.count || 5 }));
    } catch (e) { return [502, { error: `Gagal jana ayat: ${e.message}`, detected: found, briefId: brief.id }]; }

    const slots = sched.nextSlots(store, posts.length);
    const made = posts.map((p, i) => store.addPost({
      platform: platforms.includes(p.platform) ? p.platform : platforms[i % platforms.length],
      accountId: store.accountFor(p.platform)?.id || null,
      text: p.caption,
      status: body.status || "review",
      scheduledAt: slots[i] ?? null,
      source: "ai",
      briefId: brief.id,
      script: { angle: p.angle, hook: p.hook, body: p.body, cta: p.cta, broll: p.broll, reply: p.reply, visual: p.visual },
    }));
    const notes = [];
    if (store.data.settings.llm.provider === "local") notes.push("Enjin ayat masih 'local' — ini rangka, bukan cerita. Pasang AI dalam kotak Enjin ayat untuk tulisan sebenar.");
    if (made.length < (body.count || 5)) notes.push(`Hanya ${made.length} rangka berbeza boleh dijana dari fakta yang ada. Tambah harga dan kelebihan produk untuk lebih variasi.`);
    if (!brief.harga) notes.push("Harga tak dikesan — angle kiraan harga digugurkan. Isi harga dalam brief kalau kau nak angle tu.");
    if (found.descriptionQuality === "generik") notes.push("Keterangan halaman tiada fakta produk — tambah kelebihan sebenar dalam brief untuk ayat yang lebih tajam.");
    store.log("info", `Quick: ${made.length} post dari ${found.marketplace} — ${brief.nama}`);
    return [200, { detected: found, briefId: brief.id, posts: made, notes }];
  }],

  // --- Sambung Threads tanpa server HTTPS (salin URL dari bar alamat).
  ["POST", /^\/api\/threads\/setup$/, async (_m, body) => {
    const t = store.data.settings.threads;
    if (typeof body.appId === "string") t.appId = body.appId.trim();
    if (typeof body.appSecret === "string" && body.appSecret !== "__SET__") t.appSecret = body.appSecret.trim();
    if (typeof body.redirectUri === "string" && body.redirectUri.trim()) t.redirectUri = body.redirectUri.trim();
    store.save();
    try { return [200, { ok: true, authorizeUrl: authorizeUrl(t), redirectUri: t.redirectUri }]; }
    catch (e) { return [400, { error: e.message }]; }
  }],
  ["POST", /^\/api\/threads\/connect$/, async (_m, body) => {
    const t = store.data.settings.threads;
    let code;
    try { code = extractCode(body.redirectUrl || body.code); }
    catch (e) { return [400, { error: e.message }]; }
    try {
      const acc = await exchange({ appId: t.appId, appSecret: t.appSecret, redirectUri: t.redirectUri, code });
      store.data.accounts = store.data.accounts.filter(a => a.platform !== "threads");
      const account = {
        id: rid(), platform: "threads", label: acc.username ? "@" + acc.username : "Threads",
        token: acc.token, expiresAt: acc.expiresAt, meta: { userId: acc.userId, username: acc.username },
      };
      store.data.accounts.push(account);
      store.save();
      store.log("info", `Threads bersambung: ${account.label}`);
      return [200, { ok: true, account: { ...account, token: mask(account.token) }, shortLived: acc.shortLived }];
    } catch (e) { return [502, { error: e.message }]; }
  }],

  // --- Pustaka produk: tampal link sekali, sistem ingat.
  ["POST", /^\/api\/products$/, async (_m, body) => {
    if (!body.url) return [400, { error: "Bagi link produk." }];
    let found = {};
    try { found = await detect(String(body.url)); } catch (e) { found = { warnings: [e.message] }; }
    const product = {
      id: rid(),
      url: found.affiliateUrl || String(body.url),
      name: body.name || found.name || "",
      price: body.price || found.price || "",
      image: found.image || "",
      marketplace: found.marketplace || "",
      masalah: body.masalah || "",
      createdAt: Date.now(),
    };
    if (!product.name) return [422, { error: "Nama produk tak dapat dikesan. Isi nama sendiri.", detected: found }];
    store.data.products.push(product);
    store.save();
    return [200, { product, detected: found }];
  }],
  ["DELETE", /^\/api\/products\/([\w-]+)$/, async m => {
    store.data.products = store.data.products.filter(p => p.id !== m[1]);
    store.save();
    return [200, { ok: true }];
  }],

  // --- Masalah -> produk dalam pustaka yang boleh tolong.
  ["POST", /^\/api\/match$/, async (_m, body) => {
    const masalah = String(body.masalah || "").trim();
    if (!masalah) return [400, { error: "Tulis masalah dulu." }];
    const lib = store.data.products;
    if (!lib.length) return [422, { error: "Pustaka produk kosong. Tambah beberapa link produk dulu." }];
    const want = Math.min(body.count || 5, lib.length);
    try {
      const picked = await matchProducts({ settings: store.data.settings, masalah, products: lib, count: want });
      return [200, { masalah, matches: picked }];
    } catch (e) { return [502, { error: e.message }]; }
  }],

  // --- Satu produk -> post mengikut gaya dan waktu pilihan.
  ["POST", /^\/api\/compose$/, async (_m, body) => {
    const style = STYLES[body.style] ? body.style : "cerita";
    let product = body.productId ? store.data.products.find(p => p.id === body.productId) : null;
    let found = null;
    if (!product) {
      if (!body.url) return [400, { error: "Bagi link produk atau pilih dari pustaka." }];
      try { found = await detect(String(body.url)); } catch (e) { return [502, { error: e.message }]; }
      if (!found.hasName && !body.nama) return [422, { error: "Produk tak dapat dikesan. Isi nama sendiri.", detected: found }];
      product = { url: found.affiliateUrl, name: body.nama || found.name, price: body.harga || found.price, image: found.image, marketplace: found.marketplace };
    }
    const brief = {
      id: rid(), name: product.name, mode: body.mode || "affiliate", nama: product.name,
      harga: product.price || body.harga || "", link: product.url, niche: product.marketplace || "",
      keterangan: found?.descriptionQuality === "produk" ? found.description : "",
      kelebihan: body.kelebihan || [], masalah: body.masalah || product.masalah || "",
      cerita: body.cerita || "", audience: body.audience || "pengguna media sosial Malaysia, 25-40",
      bahasa: "bm-santai", tone: "Santai & jujur", cta: "Link dalam balasan pertama",
      angles: [STYLES[style].angle], image: product.image, lastUsedAt: Date.now(),
    };
    let posts;
    try {
      ({ posts } = await generate({ settings: store.data.settings, brief, platforms: ["threads"], count: body.count || 3 }));
    } catch (e) { return [502, { error: `Gagal tulis ayat: ${e.message}` }]; }

    const slots = sched.customSlots(store, posts.length, body.times, body.startDate);
    const made = posts.map((p, i) => store.addPost({
      platform: "threads",
      accountId: store.accountFor("threads")?.id || null,
      text: p.caption, status: body.status === "scheduled" ? "scheduled" : "review",
      scheduledAt: slots[i] ?? null, source: "ai", briefId: brief.id,
      script: { angle: p.angle || STYLES[style].label, hook: p.hook, body: p.body, cta: p.cta, reply: p.reply, visual: p.visual },
    }));
    const notes = [];
    if (store.data.settings.llm.provider === "local") {
      notes.push("Enjin ayat masih 'local' — ini rangka ayat, bukan cerita. Isi kotak Enjin ayat di bawah untuk tulisan sebenar.");
    }
    if (made.length < (body.count || 3)) {
      notes.push(`Hanya ${made.length} rangka berbeza boleh dijana dari fakta yang ada${product.price ? "" : " (harga pun tak dikesan)"}.`);
    }
    store.log("info", `Compose: ${made.length} post gaya ${style} untuk ${product.name}`);
    return [200, { product, style, posts: made, detected: found, notes }];
  }],

  // --- Tiada API key? Ambil arahan, jalankan dalam AI kau sendiri, tampal hasil balik.
  ["POST", /^\/api\/compose\/prompt$/, async (_m, body) => {
    const r = await briefDariBody(body);
    if (r.error) return [r.code, { error: r.error, detected: r.detected }];
    return [200, { prompt: buildPromptFor(r.brief, ["threads"], body.count || 3), product: r.product }];
  }],
  ["POST", /^\/api\/compose\/import$/, async (_m, body) => {
    const posts = parsePosts(String(body.text || ""));
    if (!posts.length) {
      return [422, { error: "Tak jumpa post dalam teks tu. Pastikan kau salin SEMUA jawapan AI, termasuk bahagian { \"posts\": [ ... ] }." }];
    }
    const slots = sched.customSlots(store, posts.length, body.times, body.startDate);
    const made = posts.map((p, i) => store.addPost({
      platform: "threads",
      accountId: store.accountFor("threads")?.id || null,
      text: p.caption,
      status: "review",
      scheduledAt: slots[i] ?? null,
      source: "ai",
      briefId: body.briefId || null,
      script: { angle: p.angle, hook: p.hook, body: p.body, cta: p.cta, reply: p.reply, visual: p.visual },
    }));
    store.log("info", `Import: ${made.length} post ditampal dari AI luar`);
    return [200, { posts: made }];
  }],

  ["POST", /^\/api\/slots$/, async (_m, body) =>
    [200, { slots: sched.nextSlots(store, Math.max(1, Math.min(50, body.count || 1))) }]],

  ["POST", /^\/api\/autopilot\/run$/, async () => {
    const n = await sched.runAutopilot(store, { force: true });
    return [200, { added: n, state: publicState() }];
  }],

  ["POST", /^\/api\/accounts$/, async (_m, body) => {
    if (!body.platform) return [400, { error: "platform wajib." }];
    const acc = {
      id: rid(), platform: body.platform, label: body.label || body.platform,
      token: body.token || "", expiresAt: body.expiresAt || null, meta: body.meta || {},
    };
    store.data.accounts.push(acc);
    store.save();
    store.log("info", `Akaun ditambah: ${acc.platform} (${acc.label})`);
    return [200, { account: { ...acc, token: mask(acc.token) } }];
  }],
  ["DELETE", /^\/api\/accounts\/([\w-]+)$/, async m => {
    store.data.accounts = store.data.accounts.filter(a => a.id !== m[1]);
    store.save();
    return [200, { ok: true }];
  }],
  ["POST", /^\/api\/accounts\/([\w-]+)\/verify$/, async m => {
    const acc = store.account(m[1]);
    if (!acc) return [404, { error: "Akaun tak dijumpai." }];
    return [200, await verify(acc)];
  }],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    // OAuth (tiada auth token sebab datang dari browser redirect)
    let m;
    if ((m = url.pathname.match(/^\/oauth\/(threads|meta)\/start$/))) {
      try { return res.writeHead(302, { location: startUrl(m[1]) }).end(); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if ((m = url.pathname.match(/^\/oauth\/(threads|meta)\/callback$/))) {
      const code = url.searchParams.get("code");
      if (!code) return send(res, 400, "<h1>Tiada code dalam callback.</h1>", { "content-type": "text/html" });
      try {
        const accounts = await handleCallback(m[1], code);
        store.data.accounts.push(...accounts);
        store.save();
        store.log("info", `OAuth ${m[1]}: ${accounts.map(a => a.platform + "/" + a.label).join(", ")}`);
        return res.writeHead(302, { location: "/#akaun" }).end();
      } catch (e) {
        store.log("error", `OAuth ${m[1]} gagal: ${e.message}`);
        return send(res, 400, `<h1>OAuth gagal</h1><pre>${escapeHtml(e.message)}</pre>`, { "content-type": "text/html" });
      }
    }

    if (url.pathname.startsWith("/api/")) {
      if (TOKEN && req.headers["x-viralcool-token"] !== TOKEN && url.searchParams.get("token") !== TOKEN)
        return send(res, 401, { error: "Token salah." });
      for (const [method, re, handler] of ROUTES) {
        const match = url.pathname.match(re);
        if (match && req.method === method) {
          const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
          const [code, payload] = await handler(match, body);
          return send(res, code, payload);
        }
      }
      return send(res, 404, { error: "Tiada route." });
    }

    return serveStatic(url.pathname, res);
  } catch (e) {
    store.log("error", `${req.method} ${url.pathname}: ${e.message}`);
    send(res, 500, { error: e.message });
  }
});

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.join(HERE, "public", rel);
  if (!file.startsWith(path.join(HERE, "public"))) return send(res, 403, { error: "Nope." });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: "Tiada fail." });
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}
const escapeHtml = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function startServer() {
  return new Promise(resolve => {
    server.listen(PORT, HOST, () => {
      const stop = sched.start(store, { dry: DRY });
      store.log("info", `ViralCool jalan di http://${HOST}:${PORT}${DRY ? " (DRY-RUN: tiada apa diterbitkan betul-betul)" : ""}`);
      resolve({ server, store, stop });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer();
}
export { store, server };
