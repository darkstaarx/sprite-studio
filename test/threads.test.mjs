import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { authorizeUrl, extractCode } from "../lib/threads-setup.mjs";

test("authorizeUrl bawa scope penerbitan dan tolak redirect bukan https", () => {
  const u = new URL(authorizeUrl({ appId: "123", redirectUri: "https://viralcool.invalid/callback" }));
  assert.equal(u.searchParams.get("client_id"), "123");
  assert.equal(u.searchParams.get("scope"), "threads_basic,threads_content_publish");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.throws(() => authorizeUrl({ appId: "123", redirectUri: "http://contoh.my/cb" }), /https/);
  assert.throws(() => authorizeUrl({ appId: "", redirectUri: "https://x/cb" }), /App ID/);
});

test("extractCode terima apa cara pun pengguna salin", () => {
  const kod = "AQBxxxxxxxxxxxxxxxxxxxxxxxx";
  assert.equal(extractCode(`https://localhost:8787/cb?code=${kod}#_`), kod, "URL penuh");
  assert.equal(extractCode(`  ${kod}  `), kod, "kod mentah");
  assert.equal(extractCode(`code=${kod}`), kod, "salin bahagian code sahaja");
  assert.equal(extractCode(`localhost:8787/cb?code=${kod}&state=x`), kod, "URL tanpa skema, ada parameter lain");
  assert.equal(extractCode(`${kod}#__`), kod, "buang ekor # yang Meta tambah");
  assert.throws(() => extractCode("https://localhost:8787/cb?error=access_denied&error_description=Pengguna+tolak"), /Pengguna tolak/);
  assert.throws(
    () => extractCode("https://www.threads.com/oauth/authorize/error.json?error_message=URL+Blocked%3A+This+redirect+failed+because+the+redirect+URI+is+not+whitelisted&error_code=1349168"),
    /belum didaftarkan/, "terangkan URL Blocked, bukan sekadar ulang mesej Meta");
  assert.throws(() => extractCode("https://localhost:8787/cb"), /Tak jumpa kod/);
  assert.throws(() => extractCode("AQB123"), /terlalu pendek/);
  assert.throws(() => extractCode(""), /Tampal kod atau URL/);
});

// Meta palsu untuk menguji pertukaran kod tanpa menyentuh rangkaian sebenar.
let meta, base;
before(async () => {
  meta = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    res.setHeader("content-type", "application/json");
    if (u.pathname === "/oauth/access_token") return res.end(JSON.stringify({ access_token: "SHORT", user_id: "9" }));
    if (u.pathname === "/access_token") return res.end(JSON.stringify({ access_token: "LONG60", expires_in: 5184000 }));
    if (u.pathname === "/v1.0/me") {
      if (u.searchParams.get("access_token") !== "LONG60") { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: "token salah" } })); }
      return res.end(JSON.stringify({ id: "17841400000", username: "affie" }));
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise(r => meta.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${meta.address().port}`;
  process.env.THREADS_GRAPH_BASE = base;
});
after(() => meta.close());

test("exchange tukar kod jadi token 60 hari dan baca akaun", async () => {
  const { exchange } = await import("../lib/threads-setup.mjs?fresh=1");
  const r = await exchange({ appId: "1", appSecret: "s", redirectUri: "https://localhost/cb", code: "AQB" });
  assert.equal(r.token, "LONG60");
  assert.equal(r.userId, "17841400000");
  assert.equal(r.username, "affie");
  assert.equal(r.shortLived, false);
  assert.ok(r.expiresAt > Date.now() + 50 * 24 * 3600e3, "luput lebih 50 hari dari sekarang");
});

test("authorizeUrl tolak localhost sebab Threads memang tak terima", () => {
  for (const bad of ["https://localhost:8787/cb", "https://127.0.0.1:8787/cb", "https://[::1]/cb"]) {
    assert.throws(() => authorizeUrl({ appId: "1", redirectUri: bad }), /tak terima localhost/, bad);
  }
  const ok = authorizeUrl({ appId: "1", redirectUri: "https://viralcool.invalid/callback" });
  assert.match(ok, /redirect_uri=https%3A%2F%2Fviralcool\.invalid%2Fcallback/);
});

test("ralat umum Meta (kod 1) diterjemah jadi senarai semakan", () => {
  assert.throws(
    () => extractCode("https://www.threads.com/oauth/authorize/error.json?error_message=An+unknown+error+has+occurred.&error_code=1"),
    e => {
      assert.match(e.message, /kod 1/);
      assert.match(e.message, /Threads Tester/);
      assert.match(e.message, /bukan public/);
      assert.match(e.message, /log masuk Threads/);
      assert.match(e.message, /cuba lagi/);
      return true;
    });
});

test("App ID yang sebenarnya base URL atau key AI ditolak sebelum sampai Meta", () => {
  // Meta hanya balas "Invalid client_id: <nilai>" tanpa beritahu medan mana yang salah.
  assert.throws(
    () => authorizeUrl({ appId: "https://serveras.click/v1", redirectUri: "https://viralcool.invalid/callback" }),
    e => {
      assert.match(e.message, /alamat web/);
      assert.match(e.message, /Enjin ayat/, "tunjuk medan yang betul untuk base URL");
      return true;
    });
  assert.throws(
    () => authorizeUrl({ appId: "asai_sk_abcdef123456", redirectUri: "https://viralcool.invalid/callback" }),
    /API key AI/);
  assert.throws(
    () => authorizeUrl({ appId: "my-app-name", redirectUri: "https://viralcool.invalid/callback" }),
    /nombor sahaja/);
  // Nombor tulen tetap lulus.
  assert.match(authorizeUrl({ appId: "1234567890123456", redirectUri: "https://viralcool.invalid/callback" }),
    /client_id=1234567890123456/);
});
