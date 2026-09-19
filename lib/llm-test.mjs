// Uji tetapan LLM dengan satu panggilan kecil, dan cuba baiki base URL yang tersalah tulis.
// Gateway pihak ketiga selalunya perlahan (p95 melebihi 50 saat pernah dilihat),
// jadi ujian tak boleh menyerah terlalu awal dan menuduh tetapan yang sebenarnya betul.
const TIMEOUT = Number(process.env.LLM_TEST_TIMEOUT_MS || 75000);

/** Calon base URL: yang diberi, dan variasi lazim yang orang terlupa. */
export function candidates(baseUrl) {
  const clean = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return [];
  const out = [clean];
  if (!/\/v\d+$/.test(clean)) out.push(clean + "/v1");
  if (/\/v\d+$/.test(clean)) out.push(clean.replace(/\/v\d+$/, ""));
  return [...new Set(out)];
}

async function tryOne({ provider, baseUrl, model, apiKey }, fetchImpl = fetch) {
  const anthropic = provider === "anthropic";
  const url = baseUrl + (anthropic ? "/v1/messages" : "/chat/completions");
  const headers = anthropic
    ? { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { "content-type": "application/json", ...(apiKey ? { authorization: "Bearer " + apiKey } : {}) };
  const body = anthropic
    ? { model, max_tokens: 16, messages: [{ role: "user", content: "Balas satu perkataan: ok" }] }
    : { model, max_tokens: 16, messages: [{ role: "user", content: "Balas satu perkataan: ok" }] };

  const res = await fetchImpl(url, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 200);
    return { ok: false, status: res.status, url, error: `${res.status} — ${msg}` };
  }
  const balasan = json?.choices?.[0]?.message?.content
    ?? json?.content?.map(c => c.text).filter(Boolean).join(" ")
    ?? "";
  return { ok: true, url, baseUrl, reply: String(balasan).trim().slice(0, 80) };
}

/**
 * Uji setiap calon base URL sampai satu berjaya.
 * Balik base URL yang betul supaya app boleh simpan yang itu.
 */
export async function testLLM(settings, fetchImpl = fetch) {
  const { provider = "openai", model, apiKey } = settings;
  if (!model) return { ok: false, error: "Model belum diisi." };
  const list = candidates(settings.baseUrl);
  if (!list.length) return { ok: false, error: "Base URL belum diisi." };

  const cuba = [];
  for (const baseUrl of list) {
    try {
      const r = await tryOne({ provider, baseUrl, model, apiKey }, fetchImpl);
      cuba.push({ baseUrl, ...r });
      if (r.ok) return { ok: true, baseUrl, reply: r.reply, cuba };
    } catch (e) {
      cuba.push({ baseUrl, ok: false,
        error: e.name === "TimeoutError"
          ? `tamat masa selepas ${Math.round(TIMEOUT / 1000)}s — pembekal mungkin perlahan, cuba sekali lagi`
          : e.message });
    }
  }
  // 404 biasanya bermakna laluan salah, bukan masalah sebenar. Utamakan ralat yang
  // memberitahu sesuatu tentang kunci atau kuota (401, 403, 429, 5xx).
  const bermakna = cuba.find(c => c.status && c.status !== 404) || cuba.find(c => c.error);
  return { ok: false, error: bermakna?.error || "Tak dapat sambung.", cuba };
}
