import { test, before, after } from "node:test";
import assert from "node:assert/strict";
process.env.VIRALCOOL_QUIET = "1";
process.env.PORT = "0";
process.env.VIRALCOOL_DRY = "1";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.VIRALCOOL_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vc-plan-")), "db.json");
import http from "node:http";

let stop, server, shop, llm;
const base = () => `http://127.0.0.1:${server.address().port}`;
const api = async (p, init) => {
  const r = await fetch(base() + p, { headers: { "content-type": "application/json" }, ...init });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

before(async () => {
  // kedai palsu + model palsu yang sentiasa pulangkan post bersih
  shop = http.createServer((req, res) => {
    const nama = req.url.includes("kalung") ? "Kalung Kucing Loceng" : "Mainan Anjing Getah";
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><meta property="og:title" content="${nama}"></head><body></body></html>`);
  });
  await new Promise(r => shop.listen(0, "127.0.0.1", r));

  llm = http.createServer((req, res) => {
    let raw = ""; req.on("data", d => raw += d);
    req.on("end", () => {
      const minta = JSON.parse(raw || "{}").messages?.[0]?.content || "";
      const tips = /kandungan nilai/i.test(minta);
      const berapa = Number((minta.match(/Hasilkan (\d+) post/) || [])[1] || 1);
      const satu = i => ({
        platform: "threads", angle: tips ? "Tips" : "Cerita",
        caption: tips
          ? `Kucing korang tolak pinggan air tiap pagi? Cuba alih ke tempat lain dari mangkuk makanan ${i}.\n\nDia bukan degil, dia cuma tak suka bau makanan dekat air.`
          : `Weh benda ni memang berguna untuk rumah ada pet ${i}.\n\nAku guna dah dua minggu, takde hal setakat ni.\n\nKorang usya la dulu.`,
        reply: tips ? "" : "Link: x",
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ posts: Array.from({ length: berapa }, (_, i) => satu(i + 1)) }) } }] }));
    });
  });
  await new Promise(r => llm.listen(0, "127.0.0.1", r));

  const mod = await import("../server.mjs");
  ({ stop, server } = await mod.startServer());
  await api("/api/settings", { method: "POST", body: JSON.stringify({ llm: { provider: "openai", baseUrl: `http://127.0.0.1:${llm.address().port}`, model: "m", apiKey: "k" } }) });
});
after(() => { stop?.(); server?.close(); shop?.close(); llm?.close(); });

test("dua akaun boleh wujud serentak, setiap satu ada niche sendiri", async () => {
  const a = await api("/api/accounts", { method: "POST", body: JSON.stringify({ platform: "threads", label: "@pet.kedai", token: "t1", meta: { userId: "1" } }) });
  const b = await api("/api/accounts", { method: "POST", body: JSON.stringify({ platform: "threads", label: "@dapur.kedai", token: "t2", meta: { userId: "2" } }) });
  assert.equal(a.status, 200); assert.equal(b.status, 200);

  await api(`/api/accounts/${a.body.account.id}`, { method: "PATCH", body: JSON.stringify({ niche: "barangan pet", mix: { jual: 1, tips: 2 } }) });
  const st = await api("/api/state");
  const akaun = st.body.accounts.filter(x => x.platform === "threads");
  assert.equal(akaun.length, 2, "kedua-dua akaun kekal");
  assert.equal(akaun.find(x => x.id === a.body.account.id).niche, "barangan pet");
});

test("rancangan seminggu campur jualan dengan tips ikut nisbah", async () => {
  const st = await api("/api/state");
  const acc = st.body.accounts.find(x => x.label === "@pet.kedai");
  const port = shop.address().port;
  for (const slug of ["kalung-i.1.1", "mainan-i.2.2"]) {
    await api("/api/products", { method: "POST", body: JSON.stringify({ url: `http://127.0.0.1:${port}/${slug}` }) });
  }

  const r = await api("/api/plan", { method: "POST", body: JSON.stringify({
    accountId: acc.id, days: 3, times: ["07:00", "13:00", "19:00"], mix: { jual: 1, tips: 2 } }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.posts.length, 9, "3 hari x 3 slot");

  const jual = r.body.posts.filter(p => p.jenis === "jual").length;
  const tips = r.body.posts.filter(p => p.jenis === "tips").length;
  assert.equal(jual, 3, "sepertiga jualan");
  assert.equal(tips, 6, "dua pertiga kandungan nilai");
  assert.ok(r.body.posts.every(p => p.accountId === acc.id), "semua milik akaun yang dipilih");
  assert.ok(r.body.posts.every(p => p.scheduledAt > Date.now()));

  // jualan tak berlonggok: corak J T T berulang
  const urutan = r.body.posts.slice().sort((a, b) => a.scheduledAt - b.scheduledAt).map(p => p.jenis[0]).join("");
  assert.equal(urutan, "jttjttjtt");

  // tips tak boleh bawa link atau produk
  assert.ok(r.body.posts.filter(p => p.jenis === "tips").every(p => !/https?:\/\//.test(p.text)), "tips tiada link");
});

test("plan menolak dengan sebab bila bahan tak cukup", async () => {
  const st = await api("/api/state");
  const kosong = st.body.accounts.find(x => x.label === "@dapur.kedai");
  const r = await api("/api/plan", { method: "POST", body: JSON.stringify({ accountId: kosong.id, days: 1, mix: { jual: 0, tips: 1 } }) });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /Isi niche/);
});
