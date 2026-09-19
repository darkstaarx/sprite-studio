import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { candidates, testLLM } from "../lib/llm-test.mjs";

test("candidates cuba /v1 bila pengguna terlupa", () => {
  assert.deepEqual(candidates("https://serveras.click/"), ["https://serveras.click", "https://serveras.click/v1"]);
  assert.deepEqual(candidates("https://x.my/v1"), ["https://x.my/v1", "https://x.my"]);
  assert.deepEqual(candidates(""), []);
});

let srv, base;
before(async () => {
  srv = http.createServer((req, res) => {
    let raw = ""; req.on("data", d => raw += d);
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      // hanya /v1/chat/completions wujud, dan hanya dengan kunci betul
      if (req.url !== "/v1/chat/completions") { res.statusCode = 404; return res.end(JSON.stringify({ error: { message: "not found" } })); }
      if (req.headers.authorization !== "Bearer kunci-betul") { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: "Invalid API key" } })); }
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

test("testLLM jumpa /v1 sendiri bila base URL tak lengkap", async () => {
  const r = await testLLM({ provider: "openai", baseUrl: base + "/", model: "GPT-Sol", apiKey: "kunci-betul" });
  assert.equal(r.ok, true);
  assert.equal(r.baseUrl, base + "/v1", "base URL dibetulkan");
  assert.equal(r.reply, "ok");
});

test("testLLM laporkan kunci salah dengan mesej pembekal", async () => {
  const r = await testLLM({ provider: "openai", baseUrl: base + "/v1", model: "GPT-Sol", apiKey: "kunci-salah" });
  assert.equal(r.ok, false);
  assert.match(r.error, /401/);
  assert.match(r.error, /Invalid API key/);
});

test("testLLM tolak tetapan tak lengkap tanpa memanggil rangkaian", async () => {
  assert.match((await testLLM({ provider: "openai", baseUrl: base, model: "" })).error, /Model belum diisi/);
  assert.match((await testLLM({ provider: "openai", baseUrl: "", model: "x" })).error, /Base URL belum diisi/);
});
