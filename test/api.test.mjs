import { test, before, after } from "node:test";
import assert from "node:assert/strict";
process.env.VIRALCOOL_QUIET = "1";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PORT = "0";   // biar OS pilih port kosong — elak perlanggaran dengan server lain
process.env.HOST = "127.0.0.1";
process.env.VIRALCOOL_DRY = "1";
process.env.VIRALCOOL_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vc-api-")), "db.json");

let stop, server;
const base = () => `http://127.0.0.1:${server.address().port}`;
const api = async (p, init) => {
  const r = await fetch(base() + p, { headers: { "content-type": "application/json" }, ...init });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
};

before(async () => {
  const mod = await import("../server.mjs");
  ({ stop, server } = await mod.startServer());
});
after(() => { stop?.(); server?.close(); });

test("GET / bagi UI", async () => {
  const r = await fetch(base() + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /ViralCool/);
});

test("state awal kosong tapi lengkap", async () => {
  const { body } = await api("/api/state");
  assert.deepEqual(body.posts, []);
  assert.ok(body.platforms.threads);
  assert.ok(body.angles["review-jujur"]);
  assert.equal(body.dry, true);
});

test("aliran penuh: brief → jana → barisan → approve → terbit", async () => {
  const brief = (await api("/api/briefs", { method: "POST", body: JSON.stringify({
    name: "Air Fryer", nama: "Air Fryer 5L", harga: "RM89",
    kelebihan: ["Senang basuh"], cta: "Link dalam bio.", angles: ["review-jujur"],
  }) })).body.brief;
  assert.ok(brief.id);

  const gen = await api("/api/generate", { method: "POST", body: JSON.stringify({ briefId: brief.id, platforms: ["manual"], count: 2 }) });
  assert.equal(gen.status, 200);
  assert.equal(gen.body.posts.length, 2);

  const made = await api("/api/posts", { method: "POST", body: JSON.stringify({
    autoSlot: true, posts: gen.body.posts.map(p => ({ platform: "manual", text: p.caption, status: "review", source: "ai", briefId: brief.id })),
  }) });
  assert.equal(made.body.posts.length, 2);
  assert.ok(made.body.posts[0].scheduledAt > Date.now(), "auto-slot letak masa akan datang");

  const id = made.body.posts[0].id;
  assert.equal((await api(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify({ status: "scheduled" }) })).body.post.status, "scheduled");

  const pub = await api(`/api/posts/${id}/publish`, { method: "POST" });
  assert.equal(pub.body.post.status, "published");
  assert.match(pub.body.post.remoteId, /^dry-/);

  assert.equal((await api(`/api/posts/${made.body.posts[1].id}`, { method: "DELETE" })).status, 200);
});

test("slot tak berlanggar antara panggilan", async () => {
  const a = (await api("/api/slots", { method: "POST", body: JSON.stringify({ count: 3 }) })).body.slots;
  assert.equal(new Set(a).size, 3);
  assert.ok(a.every(t => t > Date.now()));
});

test("autopilot paksa jana guna brief tersimpan", async () => {
  await api("/api/settings", { method: "POST", body: JSON.stringify({ autopilot: { platforms: ["manual"], batch: 2, autoPublish: false } }) });
  const r = await api("/api/autopilot/run", { method: "POST", body: "{}" });
  assert.equal(r.body.added, 2);
  const review = r.body.state.posts.filter(p => p.status === "review" && p.source === "ai");
  assert.ok(review.length >= 2);
  assert.ok(review.every(p => p.scheduledAt));
});

test("api key tak pernah dibalas mentah", async () => {
  await api("/api/settings", { method: "POST", body: JSON.stringify({ llm: { provider: "openai", baseUrl: "https://x/v1", model: "m", apiKey: "sk-rahsia-123" } }) });
  const { body } = await api("/api/state");
  assert.equal(body.settings.llm.apiKey, "__SET__");
  assert.ok(!JSON.stringify(body).includes("sk-rahsia-123"));
  // "__SET__" tak boleh timpa key sebenar
  await api("/api/settings", { method: "POST", body: JSON.stringify({ llm: { apiKey: "__SET__", model: "m2" } }) });
  const db = JSON.parse(fs.readFileSync(process.env.VIRALCOOL_DB, "utf8"));
  assert.equal(db.settings.llm.apiKey, "sk-rahsia-123");
  await api("/api/settings", { method: "POST", body: JSON.stringify({ llm: { provider: "local", apiKey: "" } }) });
});

test("token akaun dimask dalam state", async () => {
  await api("/api/accounts", { method: "POST", body: JSON.stringify({ platform: "threads", label: "@aku", token: "THQVJ-rahsia-panjang-sekali", meta: { userId: "123" } }) });
  const { body } = await api("/api/state");
  assert.ok(!JSON.stringify(body.accounts).includes("rahsia-panjang"));
  assert.match(body.accounts[0].token, /…/);
});

test("route tak wujud bagi 404 JSON", async () => {
  assert.equal((await api("/api/entah-apa")).status, 404);
});

test("api otak: senarai, baca, simpan, dan tolak laluan luar", async () => {
  const list = await api("/api/prompts");
  assert.ok(list.body.prompts.some(p => p.name === "base"));
  assert.ok(list.body.prompts.some(p => p.name === "threads"));

  const pb = await api("/api/prompts/threads");
  assert.match(pb.body.text, /Playbook Threads/);

  const before = pb.body.text;
  const edited = before.replace("## 8. Elak sepenuhnya", "## 8. Elak sepenuhnya (diuji)");
  assert.equal((await api("/api/prompts/threads", { method: "POST", body: JSON.stringify({ text: edited }) })).status, 200);
  assert.match((await api("/api/prompts/threads")).body.text, /diuji/);
  await api("/api/prompts/threads", { method: "POST", body: JSON.stringify({ text: before } ) });
  assert.equal((await api("/api/prompts/threads")).body.text, before, "kandungan asal dipulihkan");

  assert.equal((await api("/api/prompts/base", { method: "POST", body: JSON.stringify({ text: "pendek" }) })).status, 400);
  assert.equal((await api("/api/prompts/..%2fbase-prompt")).status, 404);
});

test("post threads yang dijana bawa reply + visual ke barisan", async () => {
  const gen = await api("/api/generate", { method: "POST", body: JSON.stringify({
    brief: { nama: "Air Fryer", harga: "RM89", link: "https://shopee.com.my/x" }, platforms: ["threads"], count: 1 }) });
  const p = gen.body.posts[0];
  assert.ok(p.reply && p.visual);
  const made = await api("/api/posts", { method: "POST", body: JSON.stringify({ posts: [{ platform: "threads", text: p.caption,
    hook: p.hook, body: p.body, cta: p.cta, reply: p.reply, visual: p.visual }] }) });
  assert.equal(made.body.posts[0].script.reply, p.reply);
  assert.equal(made.body.posts[0].script.visual, p.visual);
  await api(`/api/posts/${made.body.posts[0].id}`, { method: "DELETE" });
});

test("aliran affiliate satu tekan: link -> kesan -> ayat -> jadual", async () => {
  const http = await import("node:http");
  const shop = http.createServer((req, res) => {
    if (req.url.startsWith("/s/")) { res.writeHead(302, { location: `http://127.0.0.1:${shop.address().port}/Air-Fryer-5L-i.1.2` }); return res.end(); }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><title>x</title>
      <meta property="og:title" content="Air Fryer 5L Digital">
      <meta property="og:description" content="Basket non-stick, muat ayam sebiji.">
      <meta property="og:image" content="https://cdn.contoh/af.jpg">
      <meta property="product:price:amount" content="89.00">
      <meta property="product:price:currency" content="MYR"></head><body></body></html>`);
  });
  await new Promise(r => shop.listen(0, "127.0.0.1", r));
  const link = `http://127.0.0.1:${shop.address().port}/s/abc123`;

  try {
    const r = await api("/api/quick", { method: "POST", body: JSON.stringify({ url: link, platforms: ["threads"], count: 3 }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.detected.name, "Air Fryer 5L Digital");
    assert.equal(r.body.detected.price, "RM89");
    assert.equal(r.body.detected.affiliateUrl, link, "link affiliate asal dikekalkan");

    // Tanpa AI dan tanpa kelebihan produk, enjin templat hanya boleh bagi beberapa bentuk berbeza —
    // dan ia mesti berkata demikian, bukan mengulang rangka yang sama.
    assert.ok(r.body.posts.length >= 1 && r.body.posts.length <= 3);
    assert.equal(new Set(r.body.posts.map(p => p.script.angle)).size, r.body.posts.length, "tiada rangka berulang");
    assert.ok(r.body.posts.every(p => !/\[[A-Z][A-Z ]+\]/.test(p.text)), "tiada placeholder bogel dalam teks");
    assert.ok(r.body.posts.every(p => p.scheduledAt > Date.now()));
    assert.ok(r.body.notes.some(n => /Enjin ayat masih 'local'/.test(n)), "beritahu pengguna ini rangka, bukan cerita");

    const state = await api("/api/state");
    const brief = state.body.briefs.find(b => b.id === r.body.briefId);
    assert.equal(brief.link, link);
    assert.equal(brief.harga, "RM89");

    for (const p of r.body.posts) await api(`/api/posts/${p.id}`, { method: "DELETE" });
  } finally { shop.close(); }
});

test("quick tolak link yang tak boleh dikesan tanpa nama manual", async () => {
  const r = await api("/api/quick", { method: "POST", body: JSON.stringify({ url: "http://127.0.0.1:1/tiada" }) });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /Isi nama produk sendiri/);
});

test("muka depan: pustaka produk, padan masalah, compose ikut gaya dan waktu", async () => {
  const http = await import("node:http");
  const shop = http.createServer((req, res) => {
    const nama = req.url.includes("beg") ? "Beg Sekolah Kalis Air Darjah 1-6"
      : req.url.includes("botol") ? "Botol Air Vakum 500ml Budak"
      : "Air Fryer 5L Digital";
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><meta property="og:title" content="${nama}">
      <meta property="og:image" content="https://cdn/x.jpg">
      <meta property="product:price:amount" content="59.00">
      <meta property="product:price:currency" content="MYR"></head><body></body></html>`);
  });
  await new Promise(r => shop.listen(0, "127.0.0.1", r));
  const port = shop.address().port;

  try {
    for (const slug of ["beg-i.1.1", "botol-i.2.2", "fryer-i.3.3"]) {
      const r = await api("/api/products", { method: "POST", body: JSON.stringify({ url: `http://127.0.0.1:${port}/${slug}` }) });
      assert.equal(r.status, 200, slug);
      assert.equal(r.body.product.price, "RM59");
    }
    const state1 = await api("/api/state");
    assert.equal(state1.body.products.length, 3);
    assert.ok(state1.body.styles.cerita && state1.body.styles.soalan, "gaya tulisan dihantar ke UI");

    const match = await api("/api/match", { method: "POST", body: JSON.stringify({ masalah: "beg anak sekolah rosak", count: 5 }) });
    assert.equal(match.status, 200);
    assert.match(match.body.matches[0].product.name, /Beg Sekolah/, "produk paling relevan didahulukan");
    assert.ok(match.body.matches[0].kenapa.length > 5);

    const compose = await api("/api/compose", { method: "POST", body: JSON.stringify({
      productId: match.body.matches[0].product.id, style: "cerita",
      times: ["07:00", "13:00", "19:00"], count: 3 }) });
    assert.equal(compose.status, 200);
    assert.ok(compose.body.posts.length >= 1);
    const jam = [...new Set(compose.body.posts.map(p => new Date(p.scheduledAt).getHours()))];
    assert.ok(jam.every(h => [7, 13, 19].includes(h)), `post jatuh pada waktu yang dipilih, dapat ${jam}`);
    assert.ok(compose.body.posts.every(p => p.status === "review"), "tunggu sahkan dulu");
    assert.ok(compose.body.notes.some(n => /local/.test(n)), "nota kenapa ayat masih rangka");

    for (const p of compose.body.posts) await api(`/api/posts/${p.id}`, { method: "DELETE" });
    for (const p of state1.body.products) await api(`/api/products/${p.id}`, { method: "DELETE" });
  } finally { shop.close(); }
});

test("match menolak pustaka kosong dengan sebab yang jelas", async () => {
  const r = await api("/api/match", { method: "POST", body: JSON.stringify({ masalah: "apa-apa" }) });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /Pustaka produk kosong/);
});

test("laluan tanpa key: ambil arahan, tampal jawapan AI luar, masuk barisan", async () => {
  const http = await import("node:http");
  const shop = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><meta property="og:title" content="Sabun Pods Laundry 5D">
      <meta property="product:price:amount" content="19.90">
      <meta property="product:price:currency" content="MYR"></head><body></body></html>`);
  });
  await new Promise(r => shop.listen(0, "127.0.0.1", r));
  const link = `http://127.0.0.1:${shop.address().port}/sabun-i.1.2`;

  try {
    const p = await api("/api/compose/prompt", { method: "POST", body: JSON.stringify({ url: link, style: "cerita", count: 2 }) });
    assert.equal(p.status, 200);
    assert.equal(p.body.product.name, "Sabun Pods Laundry 5D");
    assert.match(p.body.prompt, /Playbook Threads/, "playbook disertakan");
    assert.match(p.body.prompt, /Sabun Pods Laundry 5D/, "butiran produk disertakan");
    assert.match(p.body.prompt, /RM19\.90/);
    assert.ok(p.body.prompt.length > 8000, "arahan penuh, bukan potongan");

    // Jawapan gaya Hermes: ada jejak fikiran, lepas tu JSON.
    const jawapan = `<think>Saya kena tulis dua post. {kurungan} dalam fikiran.</think>
{"posts":[
 {"platform":"threads","angle":"Cerita","caption":"Petang Jumaat, basuh baju anak lagi.","reply":"Link: x #ad","visual":"mesin basuh"},
 {"platform":"threads","angle":"Soalan","caption":"Korang guna pods atau serbuk?","reply":"Aku nak tahu."}]}`;
    const imp = await api("/api/compose/import", { method: "POST", body: JSON.stringify({ text: jawapan, times: ["07:00", "19:00"] }) });
    assert.equal(imp.status, 200);
    assert.equal(imp.body.posts.length, 2);
    assert.equal(imp.body.posts[0].script.angle, "Cerita");
    assert.equal(imp.body.posts[0].script.reply, "Link: x #ad");
    assert.ok(imp.body.posts.every(x => [7, 19].includes(new Date(x.scheduledAt).getHours())));

    const kosong = await api("/api/compose/import", { method: "POST", body: JSON.stringify({ text: "entah apa-apa" }) });
    assert.equal(kosong.status, 422);
    assert.match(kosong.body.error, /Tak jumpa post/);

    for (const x of imp.body.posts) await api(`/api/posts/${x.id}`, { method: "DELETE" });
  } finally { shop.close(); }
});

test("senarai gaya ringkas dan tiada yang bertindih", async () => {
  const st = await api("/api/state");
  assert.deepEqual(Object.keys(st.body.styles), ["cerita", "lawak", "hottake", "review", "soalan"],
    "lima gaya sahaja, setiap satu jelas berbeza");
  assert.equal(st.body.styles.cerita.angle, "circle", "gaya cerita guna rangka 8 beat");
  assert.ok(!Object.values(st.body.styles).some(v => /harga/i.test(v.label)),
    "tiada gaya kiraan harga, kerana harga memang disembunyikan");

  const http = await import("node:http");
  const shop = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end('<html><head><meta property="og:title" content="Squishy Butter Toy"><meta property="product:price:amount" content="12.90"><meta property="product:price:currency" content="MYR"></head><body></body></html>');
  });
  await new Promise(r => shop.listen(0, "127.0.0.1", r));
  try {
    const p = await api("/api/compose/prompt", { method: "POST", body: JSON.stringify({
      url: `http://127.0.0.1:${shop.address().port}/toy-i.1.2`, style: "circle", count: 2 }) });
    assert.equal(p.status, 200);
    assert.match(p.body.prompt, /Story circle/i, "angle story circle masuk dalam arahan");
    assert.match(p.body.prompt, /HARGA/, "beat harga diminta");
  } finally { shop.close(); }
});

test("setup Threads tolak App ID salah dan tak simpan nilai tu", async () => {
  const buruk = await api("/api/threads/setup", { method: "POST", body: JSON.stringify({ appId: "https://serveras.click/v1" }) });
  assert.equal(buruk.status, 400);
  assert.match(buruk.body.error, /Enjin ayat/);
  assert.equal((await api("/api/state")).body.settings.threads.appId, "", "nilai salah tak masuk simpanan");

  const elok = await api("/api/threads/setup", { method: "POST", body: JSON.stringify({ appId: "1234567890123456" }) });
  assert.equal(elok.status, 200);
  assert.match(elok.body.authorizeUrl, /client_id=1234567890123456/);
});
