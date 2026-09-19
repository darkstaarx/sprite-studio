import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePosts, generate, buildBrief } from "../lib/llm.mjs";
import { Store } from "../lib/store.mjs";
import { nextSlots, tick } from "../lib/scheduler.mjs";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vc-")), "db.json");

test("parsePosts baca JSON berpagar kod", () => {
  const out = parsePosts('ni hasil:\n```json\n{"posts":[{"platform":"threads","caption":"Ayat pendek.","hashtags":["#ad"]}]}\n```');
  assert.equal(out.length, 1);
  assert.equal(out[0].platform, "threads");
  assert.match(out[0].caption, /#ad$/);
});

test("parsePosts buang hashtag yang dah ada dalam caption", () => {
  const [p] = parsePosts('{"posts":[{"platform":"threads","caption":"Review jujur #ad","hashtags":["#ad","#dapur"]}]}');
  assert.equal(p.caption, "Review jujur #ad\n\n#dapur");
});

test("parsePosts pulangkan kosong bila bukan JSON", () => {
  assert.deepEqual(parsePosts("takde apa-apa di sini"), []);
});

test("buildBrief masukkan had aksara platform", () => {
  const text = buildBrief({ nama: "Air Fryer" }, ["threads"], 2);
  assert.match(text, /had 500 aksara/);
  assert.match(text, /Hasilkan 2 post/);
});

test("provider local jana post tanpa API", async () => {
  const { posts, provider } = await generate({
    settings: { llm: { provider: "local" } },
    brief: { nama: "Air Fryer", harga: "RM89", kelebihan: ["Senang basuh"], cta: "Link dalam bio." },
    platforms: ["threads", "tiktok"], count: 4,
  });
  assert.equal(provider, "local");
  assert.equal(posts.length, 4);
  assert.ok(posts.every(p => p.caption.length > 20));
  assert.deepEqual([...new Set(posts.map(p => p.platform))].sort(), ["threads", "tiktok"]);
});

test("nextSlots langkau slot yang dah berpenghuni dan masa lampau", () => {
  const store = new Store(tmpDb());
  store.data.settings.autopilot.slots = ["09:00", "20:00"];
  const base = new Date(); base.setHours(8, 0, 0, 0);
  const first = nextSlots(store, 1, base.getTime())[0];
  assert.equal(new Date(first).getHours(), 9);
  store.addPost({ status: "scheduled", scheduledAt: first });
  const after = nextSlots(store, 1, base.getTime())[0];
  assert.equal(new Date(after).getHours(), 20);
});

test("tick terbitkan post yang sampai masa (dry) dan kekalkan yang belum", async () => {
  const store = new Store(tmpDb());
  const due = store.addPost({ platform: "manual", status: "scheduled", scheduledAt: Date.now() - 1000, text: "hai" });
  const later = store.addPost({ platform: "manual", status: "scheduled", scheduledAt: Date.now() + 60e3, text: "nanti" });
  const res = await tick(store, { dry: true });
  assert.equal(res.length, 1);
  assert.equal(store.data.posts.find(p => p.id === due.id).status, "published");
  assert.equal(store.data.posts.find(p => p.id === later.id).status, "scheduled");
});

test("tick cuba semula bila penerbit gagal", async () => {
  const store = new Store(tmpDb());
  store.data.accounts.push({ id: "a1", platform: "threads", label: "x", token: "", meta: {} });
  const p = store.addPost({ platform: "threads", accountId: "a1", status: "scheduled", scheduledAt: Date.now() - 1000, text: "hai" });
  await tick(store);
  const after = store.data.posts.find(x => x.id === p.id);
  assert.equal(after.status, "scheduled");
  assert.equal(after.attempts, 1);
  assert.match(after.error, /token|userId/i);
  assert.ok(after.scheduledAt > Date.now());
});
