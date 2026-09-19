import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurl } from "../lib/curl-parse.mjs";

test("baca contoh curl OpenAI-compatible biasa", () => {
  const r = parseCurl(`curl https://serveras.click/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-abc123" \\
  -d '{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"hi"}]}'`);
  assert.equal(r.ok, true);
  assert.equal(r.provider, "openai");
  assert.equal(r.baseUrl, "https://serveras.click/v1", "buang /chat/completions, kekalkan /v1");
  assert.equal(r.model, "gpt-5.6-sol");
  assert.equal(r.apiKey, "sk-abc123");
  assert.equal(r.keyLooksPlaceholder, false);
});

test("kenal contoh Anthropic dari header x-api-key", () => {
  const r = parseCurl(`curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \\
  -d '{"model":"claude-sonnet-4-5","max_tokens":10}'`);
  assert.equal(r.provider, "anthropic");
  assert.equal(r.baseUrl, "https://api.anthropic.com");
  assert.equal(r.model, "claude-sonnet-4-5");
  assert.equal(r.apiKey, "", "pembolehubah persekitaran bukan kunci sebenar");
  assert.equal(r.keyLooksPlaceholder, true);
});

test("tahan dengan petikan tunggal, -X POST, dan placeholder", () => {
  const r = parseCurl(`curl -X POST 'https://gateway.example.my/api/v2/chat/completions' -H 'Authorization: Bearer YOUR_API_KEY' --data-raw '{"model": "llama-3.3-70b", "stream": false}'`);
  assert.equal(r.baseUrl, "https://gateway.example.my/api/v2");
  assert.equal(r.model, "llama-3.3-70b");
  assert.equal(r.keyLooksPlaceholder, true);
  assert.equal(r.apiKey, "");
});

test("beritahu apa yang hilang dan bukan gagal senyap", () => {
  assert.match(parseCurl("").error, /Tampal contoh curl/);
  assert.match(parseCurl("takde link langsung di sini").error, /Tak jumpa alamat https/);
  const tanpaModel = parseCurl(`curl https://x.my/v1/chat/completions -H "Authorization: Bearer sk-1"`);
  assert.equal(tanpaModel.ok, true);
  assert.equal(tanpaModel.model, "");
});
