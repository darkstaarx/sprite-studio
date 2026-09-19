// Enjin jadual: terbitkan post yang dah sampai masa, dan (kalau autopilot on) suruh AI isi barisan.
import { publish } from "./publishers.mjs";
import { generate } from "./llm.mjs";

export const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2 * 60e3, 10 * 60e3, 30 * 60e3];

/** Slot masa akan datang yang belum berpenghuni, ikut tetapan autopilot. */
export function nextSlots(store, count, from = Date.now()) {
  const ap = store.data.settings.autopilot;
  const slots = (ap.slots?.length ? ap.slots : ["20:00"]).slice().sort();
  const taken = new Set(store.data.posts
    .filter(p => ["scheduled", "review", "publishing"].includes(p.status) && p.scheduledAt)
    .map(p => p.scheduledAt));
  const out = [];
  for (let d = 0; d < (ap.lookaheadDays || 7) + 7 && out.length < count; d++) {
    for (const hhmm of slots) {
      const [h, m] = hhmm.split(":").map(Number);
      const t = new Date(from);
      t.setDate(t.getDate() + d);
      t.setHours(h, m || 0, 0, 0);
      const ts = t.getTime();
      if (ts <= from + 60e3) continue;
      if (taken.has(ts)) continue;
      taken.add(ts);
      out.push(ts);
      if (out.length >= count) break;
    }
  }
  return out;
}

export function pendingCount(store) {
  return store.data.posts.filter(p => ["scheduled", "review"].includes(p.status)).length;
}

/** AI jana post baru bila barisan menipis. Balik bilangan post yang ditambah. */
export async function runAutopilot(store, { force = false } = {}) {
  const ap = store.data.settings.autopilot;
  if (!ap.enabled && !force) return 0;
  if (!force && pendingCount(store) >= ap.minQueue) return 0;

  const briefs = store.data.briefs;
  if (!briefs.length) { store.log("warn", "Autopilot: tiada brief produk. Tambah satu dulu."); return 0; }
  const brief = briefs.slice().sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0))[0];

  const platforms = (ap.platforms?.length ? ap.platforms : ["threads"])
    .filter(p => store.accountFor(p) || p === "manual");
  if (!platforms.length) { store.log("warn", "Autopilot: tiada akaun bersambung untuk platform yang dipilih."); return 0; }

  let posts;
  try {
    ({ posts } = await generate({ settings: store.data.settings, brief, platforms, count: ap.batch || 3 }));
  } catch (e) {
    store.log("error", `Autopilot gagal jana: ${e.message}`);
    return 0;
  }
  const slots = nextSlots(store, posts.length);
  posts.forEach((p, i) => {
    const target = platforms.includes(p.platform) ? p.platform : platforms[i % platforms.length];
    store.addPost({
      platform: target,
      accountId: store.accountFor(target)?.id || null,
      text: p.caption,
      status: ap.autoPublish ? "scheduled" : "review",
      scheduledAt: slots[i] ?? null,
      source: "ai",
      briefId: brief.id,
      script: { angle: p.angle, hook: p.hook, body: p.body, cta: p.cta, broll: p.broll },
    });
  });
  brief.lastUsedAt = Date.now();
  store.save();
  store.log("info", `Autopilot: ${posts.length} post baru dari brief "${brief.name || brief.nama}" (${ap.autoPublish ? "auto-publish" : "tunggu approve"}).`);
  return posts.length;
}

/** Satu pusingan: terbitkan yang dah sampai masa. */
export async function tick(store, { dry = false, now = Date.now() } = {}) {
  const due = store.data.posts.filter(p =>
    p.status === "scheduled" && p.scheduledAt && p.scheduledAt <= now && (p.attempts || 0) < MAX_ATTEMPTS);
  const results = [];
  for (const post of due) {
    store.updatePost(post.id, { status: "publishing" });
    const account = post.accountId ? store.account(post.accountId) : store.accountFor(post.platform);
    try {
      const r = await publish(post, account, { dry });
      store.updatePost(post.id, {
        status: "published", publishedAt: Date.now(), remoteId: r.remoteId, error: null,
      });
      store.log("info", `Terbit ${post.platform}: ${r.remoteId}${r.note ? " (" + r.note + ")" : ""}`);
      results.push({ id: post.id, ok: true, ...r });
    } catch (e) {
      const attempts = (post.attempts || 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      store.updatePost(post.id, {
        status: giveUp ? "failed" : "scheduled",
        attempts,
        error: e.message,
        scheduledAt: giveUp ? post.scheduledAt : Date.now() + (BACKOFF_MS[attempts - 1] || 30 * 60e3),
      });
      store.log("error", `Gagal terbit ${post.platform} (cubaan ${attempts}/${MAX_ATTEMPTS}): ${e.message}`);
      results.push({ id: post.id, ok: false, error: e.message });
    }
  }
  return results;
}

/** Loop latar belakang. */
export function start(store, { intervalMs = 30e3, dry = false } = {}) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(store, { dry });
      await runAutopilot(store);
    } catch (e) {
      store.log("error", "Scheduler: " + e.message);
    } finally { busy = false; }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
