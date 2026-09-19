#!/usr/bin/env node
// ViralCool — server tempatan: UI, API, enjin jadual, penerbit.
// Jalankan: node server.mjs   (buka http://localhost:8787)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, rid } from "./lib/store.mjs";
import { PLATFORMS } from "./lib/platforms.mjs";
import { ANGLES, generate, readBasePrompt, writeBasePrompt } from "./lib/llm.mjs";
import * as sched from "./lib/scheduler.mjs";
import { verify } from "./lib/publishers.mjs";
import { startUrl, handleCallback, oauthReady } from "./lib/oauth.mjs";

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
    settings: { ...s, llm: { ...s.llm, apiKey: s.llm.apiKey ? "__SET__" : "" } },
    accounts: store.data.accounts.map(a => ({ ...a, token: mask(a.token) })),
    briefs: store.data.briefs,
    posts: store.data.posts.slice().sort((a, b) => (a.scheduledAt || a.createdAt) - (b.scheduledAt || b.createdAt)),
    logs: store.data.logs.slice(0, 60),
    platforms: PLATFORMS,
    angles: ANGLES,
    oauth: { threads: oauthReady("threads"), meta: oauthReady("meta") },
    dry: DRY,
    now: Date.now(),
  };
}

const ROUTES = [
  ["GET", /^\/api\/state$/, async () => [200, publicState()]],

  ["POST", /^\/api\/settings$/, async (_m, body) => {
    const s = store.data.settings;
    if (body.llm) {
      const { apiKey, ...rest } = body.llm;
      Object.assign(s.llm, rest);
      if (apiKey && apiKey !== "__SET__") s.llm.apiKey = apiKey;
      if (apiKey === "") s.llm.apiKey = "";
    }
    if (body.autopilot) Object.assign(s.autopilot, body.autopilot);
    if (body.timezone) s.timezone = body.timezone;
    store.save();
    return [200, publicState()];
  }],

  ["GET", /^\/api\/base-prompt$/, async () => [200, { text: readBasePrompt() }]],
  ["POST", /^\/api\/base-prompt$/, async (_m, body) => {
    if (typeof body.text !== "string" || body.text.length < 20) return [400, { error: "Teks terlalu pendek." }];
    writeBasePrompt(body.text);
    store.log("info", "Base prompt dikemas kini.");
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
      script: p.script || (p.hook ? { angle: p.angle, hook: p.hook, body: p.body, cta: p.cta, broll: p.broll } : null),
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
