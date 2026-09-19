import { test } from "node:test";
import assert from "node:assert/strict";
process.env.VIRALCOOL_QUIET = "1";
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

test("playbook platform ditambah pada prompt bila platform tu dijana", async () => {
  const { readPlaybook, listPrompts } = await import("../lib/llm.mjs");
  const pb = readPlaybook("threads");
  assert.match(pb, /Playbook Threads/);
  assert.match(pb, /500 aksara/);
  assert.ok(listPrompts().some(p => p.name === "threads"));
  assert.equal(readPlaybook("../../etc/passwd"), "", "nama tak sah tak boleh baca fail luar");
});

test("generate local untuk threads hormat had 500 aksara dan isi reply/visual", async () => {
  const { posts } = await generate({
    settings: { llm: { provider: "local" } },
    brief: { nama: "Air Fryer 5L", harga: "RM89", sebutHarga: true, kelebihan: ["Senang basuh"], link: "https://shopee.com.my/x" },
    platforms: ["threads"], count: 5,
  });
  assert.ok(posts.every(p => p.caption.length <= 500));
  assert.ok(posts.every(p => p.reply));
  assert.ok(posts.every(p => p.visual));
  assert.ok(posts.every(p => !p.hashtags.length), "threads tak guna timbunan hashtag");
  assert.equal(new Set(posts.map(p => p.angle)).size, posts.length, "setiap post guna bentuk berbeza");
  assert.ok(posts.length >= 3, "sekurang-kurangnya tiga bentuk boleh dijana dari brief ini");
});

test("writePrompt tolak nama tak sah", async () => {
  const { writePrompt } = await import("../lib/llm.mjs");
  assert.throws(() => writePrompt("../base-prompt", "x".repeat(50)), /tak sah/);
});

test("rangka local gugurkan bentuk harga bila harga tiada", async () => {
  const tanpa = await generate({ settings: { llm: { provider: "local" } },
    brief: { nama: "Jump Starter", kelebihan: ["6000mAh"] }, platforms: ["threads"], count: 4 });
  assert.ok(tanpa.posts.every(p => !/\[HARGA\]/.test(p.caption)), "tiada placeholder harga bogel");

  const dengan = await generate({ settings: { llm: { provider: "local" } },
    brief: { nama: "Jump Starter", harga: "RM159", sebutHarga: true, kelebihan: ["6000mAh"] }, platforms: ["threads"], count: 4 });
  assert.ok(dengan.posts.some(p => p.caption.includes("RM159")), "harga dipakai bila brief membenarkannya");
});

test("playbook haramkan formula yang bunyi AI", async () => {
  const { readPlaybook } = await import("../lib/llm.mjs");
  const pb = readPlaybook("threads");
  assert.match(pb, /Dulu X\. Sekarang Y\./);
  assert.match(pb, /Bukan sebab A\. Sebab B\./);
  assert.match(pb, /Cerita sebenar/);
  assert.match(pb, /Jangan simetri/);
});

test("brief bawa cerita sebenar, atau larang reka cerita", () => {
  const dengan = buildBrief({ nama: "X", cerita: "Petang Jumaat, parking B2, pakcik security cakap..." }, ["threads"], 3);
  assert.match(dengan, /Cerita sebenar untuk dipakai/);
  assert.match(dengan, /parking B2/);

  const tanpa = buildBrief({ nama: "X" }, ["threads"], 3);
  assert.match(tanpa, /jangan reka pengalaman peribadi/);
});

test("parsePosts abaikan jejak fikiran model penaakulan", () => {
  const hermes = `<think>
Pengguna mahu 2 post. Saya perlu ikut kontrak {"posts":[...]} dan pastikan bawah 500 aksara.
Mungkin guna angle {cerita} dulu. } { kurungan dalam fikiran ni sepatutnya tak memecahkan parser.
</think>
{"posts":[{"platform":"threads","angle":"Cerita","caption":"Petang Jumaat, parking B2.","reply":"Link: x"}]}`;
  const out = parsePosts(hermes);
  assert.equal(out.length, 1);
  assert.equal(out[0].angle, "Cerita");
  assert.equal(out[0].reply, "Link: x");

  const tanpaPenutup = `Baiklah, saya fikir dulu... </think>\n{"posts":[{"platform":"threads","caption":"Dua ayat."}]}`;
  assert.equal(parsePosts(tanpaPenutup).length, 1);
});

test("playbook ada rangka cerita 8 beat dan ujian hook", async () => {
  const { readPlaybook, ANGLES } = await import("../lib/llm.mjs");
  const pb = readPlaybook("threads");
  assert.match(pb, /Story Circle/);
  assert.match(pb, /HARGA/, "beat harga wajib disebut");
  assert.match(pb, /jangan langkau beat ni/i);
  assert.match(pb, /Ujian hook/);
  assert.match(pb, /Jangan habiskan semua dalam satu post/);
  for (const a of ["circle", "hottake", "bina"]) {
    assert.ok(ANGLES[a], `angle ${a} wujud`);
    assert.ok(ANGLES[a].shape.length > 30, `angle ${a} ada struktur`);
  }
  assert.match(ANGLES.circle.shape, /HARGA/);
});

test("harga tak bocor ke dalam post melainkan diminta", () => {
  const sembunyi = buildBrief({ nama: "Squishy", harga: "RM12.90" }, ["threads"], 2);
  assert.match(sembunyi, /JANGAN tulis dalam post/);
  assert.match(sembunyi, /Elak juga 'murah'/);

  const benarkan = buildBrief({ nama: "Squishy", harga: "RM12.90", sebutHarga: true }, ["threads"], 2);
  assert.match(benarkan, /MEMBENARKAN harga disebut/);
  assert.ok(!/JANGAN sebut atau anggar harga/.test(benarkan));
});

test("panjang post dihantar sebagai julat aksara", () => {
  assert.match(buildBrief({ nama: "X", panjang: "pendek" }, ["threads"], 1), /100-180 aksara/);
  assert.match(buildBrief({ nama: "X", panjang: "panjang" }, ["threads"], 1), /380-500 aksara/);
  assert.match(buildBrief({ nama: "X" }, ["threads"], 1), /220-350 aksara/, "sederhana bila tak dinyatakan");
});

test("rangka local tak sebut harga bila harga disembunyikan", async () => {
  const brief = { nama: "Squishy Butter", harga: "RM12.90", kelebihan: ["Lembut"], link: "https://s.shopee.com.my/x" };
  const sembunyi = await generate({ settings: { llm: { provider: "local" } }, brief, platforms: ["threads"], count: 5 });
  assert.ok(sembunyi.posts.every(p => !/RM\s?12\.90/.test(p.caption)), "tiada harga dalam teks");
  assert.ok(sembunyi.posts.every(p => !/Kiraan|Hot take/.test(p.angle)), "rangka berasaskan harga digugurkan");

  const benarkan = await generate({ settings: { llm: { provider: "local" } }, brief: { ...brief, sebutHarga: true }, platforms: ["threads"], count: 5 });
  assert.ok(benarkan.posts.some(p => p.caption.includes("RM12.90")), "harga dipakai bila dibenarkan");
});
