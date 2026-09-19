import { test } from "node:test";
import assert from "node:assert/strict";
import { explain } from "../lib/llm-errors.mjs";

test("kod pembekal jadi arahan yang boleh ditindak", () => {
  assert.match(explain(402, { error: { code: "insufficient_credits", message: "Insufficient credits" } }), /Kredit tak cukup.*Top up/);
  assert.match(explain(404, { error: { code: "model_not_found", message: "Unknown model alias" } }), /id tepat.*asai\/gpt-5\.6-sol/);
  assert.match(explain(401, { error: { code: "invalid_api_key", message: "Missing key" } }), /Kunci API salah/);
  assert.match(explain(429, { error: { code: "concurrency_limit_exceeded" } }), /serentak.*lebih sedikit post/);
  assert.match(explain(503, { error: { code: "upstream_unavailable" } }), /Cuba lagi sekejap/);
});

test("kod tak dikenali jatuh ke makna status, dan mesej pembekal dikekalkan", () => {
  const r = explain(400, { error: { code: "weird_code", message: "bad shape" } });
  assert.match(r, /400 weird_code/);
  assert.match(r, /bad shape/);
  assert.match(explain(500, {}, "gateway blew up"), /pihak mereka/);
});
