import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { generate } from "../lib/llm.mjs";

let srv, base, mode = "ok", hits = 0;
before(async () => {
  srv = http.createServer((req, res) => {
    hits++;
    let raw = ""; req.on("data", d => raw += d);
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (mode === "flaky" && hits < 3) { res.statusCode = 502; return res.end(JSON.stringify({ error: { message: "bad gateway" } })); }
      if (mode === "dead") { res.statusCode = 502; return res.end("{}"); }
      const body = JSON.parse(raw || "{}");
      // sahkan kita tak hantar parameter yang gateway ketat mungkin tolak
      const extra = Object.keys(body).filter(k => !["model", "messages", "max_tokens", "temperature"].includes(k));
      // Balasan yang memang lulus lint, supaya ujian ni mengukur cuba-semula sahaja.
      const bersih = "Anak aku sorok benda ni dalam beg sekolah dan cikgu jumpa masa kelas Sains.\n\n"
        + "Sekarang satu kelas dah ada, cikgu pun ada satu atas meja dia.\n\n"
        + "Aku tak pasti aku patut bangga atau minta maaf, tapi aku dah beli dua lagi minggu ni.";
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ posts: [
        { platform: "threads", angle: "Cerita", caption: bersih, reply: "Link: x", extra: extra.join(",") }] }) } }] }));
    });
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

const settings = () => ({ llm: { provider: "openai", baseUrl: base, model: "asai/gpt-5.6-sol", apiKey: "k" } });
const brief = { nama: "Squishy Butter", link: "https://s.shopee.com.my/x" };

test("permintaan tak bawa temperature melainkan ia ditetapkan", async () => {
  mode = "ok"; hits = 0;
  const { posts } = await generate({ settings: settings(), brief, platforms: ["threads"], count: 1 });
  assert.equal(posts.length, 1);
  assert.equal(hits, 1);
});

test("502 sementara dicuba semula sampai berjaya", async () => {
  mode = "flaky"; hits = 0;
  const { posts } = await generate({ settings: settings(), brief, platforms: ["threads"], count: 1 });
  assert.equal(posts.length, 1);
  assert.equal(hits, 3, "dua kali gagal, ketiga berjaya");
});

test("502 berterusan bagi sebab dan cadangan, bukan kod bogel", async () => {
  mode = "dead"; hits = 0;
  await assert.rejects(
    () => generate({ settings: settings(), brief, platforms: ["threads"], count: 3 }),
    e => {
      assert.match(e.message, /Dah cuba 3 kali/);
      assert.match(e.message, /kurangkan bilangan post/);
      return true;
    });
  assert.equal(hits, 3);
});

test("post yang langgar peraturan dihantar semula untuk dibetulkan", async () => {
  let panggilan = 0;
  const srv2 = http.createServer((req, res) => {
    panggilan++;
    let raw = ""; req.on("data", d => raw += d);
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const body = JSON.parse(raw || "{}");
      const minta = body.messages?.[0]?.content || "";
      // Pusingan kedua mengandungi arahan pembetulan.
      const pembetulan = /Tulis semula SEMUA post/.test(minta);
      const teruk = "Hai semua, aku nak kongsi benda ni. Harga dia RM12.90 je, memang murah sangat untuk kualiti macam ni.";
      const elok = "Anak aku sorok benda ni dalam beg sekolah dan cikgu jumpa masa kelas Sains.\n\n"
        + "Sekarang satu kelas dah ada, cikgu pun ada satu atas meja dia.\n\n"
        + "Aku tak pasti aku patut bangga atau minta maaf, tapi aku dah beli dua lagi minggu ni.";
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ posts: [
        { platform: "threads", angle: "Cerita", caption: pembetulan ? elok : teruk, reply: "Link: x" }] }) } }] }));
    });
  });
  await new Promise(r => srv2.listen(0, "127.0.0.1", r));
  const b2 = `http://127.0.0.1:${srv2.address().port}`;
  try {
    const r = await generate({
      settings: { llm: { provider: "openai", baseUrl: b2, model: "m", apiKey: "k" } },
      brief: { nama: "Squishy", harga: "RM12.90" }, platforms: ["threads"], count: 1,
    });
    assert.equal(panggilan, 2, "satu pusingan pembetulan dijalankan");
    assert.ok(!/RM\s?12\.90/.test(r.posts[0].caption), "versi yang bocor harga digantikan");
    assert.ok(!/^Hai semua/.test(r.posts[0].caption));
    assert.deepEqual(r.lint[0], [], "hasil akhir lulus lint");
  } finally { srv2.close(); }
});
