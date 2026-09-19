// Simpanan JSON ringkas: satu fail, tulis atomik, tiada dependency.
import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  settings: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kuala_Lumpur",
    llm: { provider: "local", baseUrl: "", model: "", apiKey: "", temperature: 0.9 },
    autopilot: {
      enabled: false,
      platforms: ["threads"],
      slots: ["12:30", "21:00"],   // waktu tempatan mesin ni (puncak MY: 9-11 malam, 12:30-2 petang)
      minQueue: 4,                 // kalau baki post berjadual < ni, AI jana lagi
      batch: 3,                    // berapa post dijana setiap kali
      autoPublish: false,          // false = AI jana + jadual, tapi tunggu kau approve
      lookaheadDays: 7,
    },
  },
  accounts: [],   // {id, platform, label, token, refreshToken, expiresAt, meta:{}}
  products: [],   // {id, url, name, price, image, marketplace, masalah, createdAt}
  briefs: [],     // {id, name, mode, nama, link, harga, niche, kelebihan[], masalah, bukti, audience, cta, larangan, angles[], bahasa, tone, durasi, lastUsedAt}
  posts: [],      // {id, platform, accountId, text, mediaUrls[], status, scheduledAt, publishedAt, remoteId, error, attempts, source, briefId, script{}}
  logs: [],       // {ts, level, msg}
};

export class Store {
  constructor(file) {
    this.file = path.resolve(file);
    this.data = structuredClone(DEFAULTS);
    this.load();
  }
  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.data = { ...structuredClone(DEFAULTS), ...raw };
      this.data.settings = {
        ...DEFAULTS.settings, ...raw.settings,
        llm: { ...DEFAULTS.settings.llm, ...(raw.settings?.llm || {}) },
        autopilot: { ...DEFAULTS.settings.autopilot, ...(raw.settings?.autopilot || {}) },
      };
    } catch (e) {
      if (e.code !== "ENOENT") console.error("[store] gagal baca, guna default:", e.message);
      this.save();
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
  log(level, msg) {
    this.data.logs.unshift({ ts: Date.now(), level, msg: String(msg).slice(0, 800) });
    this.data.logs = this.data.logs.slice(0, 300);
    this.save();
    if (process.env.VIRALCOOL_QUIET === "1") return;     // ujian: jangan kotorkan saluran runner
    const tag = level === "error" ? "[!]" : level === "warn" ? "[~]" : "[·]";
    console.log(`${tag} ${msg}`);
  }
  // ---- posts
  addPost(p) {
    const post = {
      id: rid(), platform: "threads", accountId: null, text: "", mediaUrls: [],
      status: "draft", scheduledAt: null, publishedAt: null, remoteId: null,
      error: null, attempts: 0, source: "manual", briefId: null, script: null,
      createdAt: Date.now(), ...p,
    };
    this.data.posts.push(post);
    this.save();
    return post;
  }
  updatePost(id, patch) {
    const p = this.data.posts.find(x => x.id === id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: Date.now() });
    this.save();
    return p;
  }
  removePost(id) {
    const n = this.data.posts.length;
    this.data.posts = this.data.posts.filter(p => p.id !== id);
    this.save();
    return n !== this.data.posts.length;
  }
  account(id) { return this.data.accounts.find(a => a.id === id) || null; }
  accountFor(platform) { return this.data.accounts.find(a => a.platform === platform) || null; }
}

export const rid = () => Math.random().toString(36).slice(2, 10);
