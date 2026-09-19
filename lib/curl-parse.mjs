// Baca contoh curl dari dokumentasi pembekal dan keluarkan tetapan enjin.
// Halaman Docs hampir selalu ada satu contoh curl; itu lebih dipercayai daripada
// meminta pengguna mengagak medan mana ke mana.

const CHAT_SUFFIX = /\/(?:chat\/completions|completions|messages|responses)\/?$/i;

/** Ambil URL pertama dalam teks curl. */
function findUrl(text) {
  const m = text.match(/https?:\/\/[^\s'"\\<>)]+/);
  return m ? m[0].replace(/[),.;]+$/, "") : "";
}

function findHeaders(text) {
  const out = {};
  const re = /-H\s*(?:'([^']+)'|"([^"]+)"|(\S+:[^\s]+))/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] || m[2] || m[3] || "";
    const i = raw.indexOf(":");
    if (i > 0) out[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim();
  }
  return out;
}

/** Badan -d / --data: JSON penuh atau separa. */
function findBody(text) {
  const m = text.match(/(?:-d|--data(?:-raw|-binary)?)\s*(?:'([\s\S]*?)'|"([\s\S]*?)"|(\{[\s\S]*\}))/i);
  const raw = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { /* cuba cara kasar */ }
  const model = raw.match(/"model"\s*:\s*"([^"]+)"/);
  return model ? { model: model[1] } : {};
}

export function parseCurl(text) {
  const src = String(text || "");
  if (!src.trim()) return { ok: false, error: "Tampal contoh curl dari halaman Docs pembekal kau." };

  const url = findUrl(src);
  if (!url) return { ok: false, error: "Tak jumpa alamat https dalam teks tu. Salin seluruh contoh curl, termasuk barisan pertama." };

  const headers = findHeaders(src);
  const body = findBody(src);

  let u;
  try { u = new URL(url); } catch { return { ok: false, error: "Alamat dalam contoh tu tak sah." }; }

  const anthropic = Boolean(headers["x-api-key"] || headers["anthropic-version"]) || /\/v1\/messages\/?$/i.test(u.pathname);
  let path = u.pathname.replace(/\/+$/, "");
  if (anthropic) path = path.replace(/\/v1\/messages$/i, "");
  else path = path.replace(CHAT_SUFFIX, "");

  const auth = headers["authorization"] || "";
  const bearer = auth.match(/^Bearer\s+(\S+)/i);
  const key = bearer ? bearer[1] : (headers["x-api-key"] || "");
  const placeholder = /^(\$|<|\{|your|sk-xxx|xxx|api[-_]?key)/i.test(key) || /YOUR_API_KEY|<.*>|\$\{?[A-Z_]+/.test(key);

  return {
    ok: true,
    provider: anthropic ? "anthropic" : "openai",
    baseUrl: u.origin + path,
    model: body.model || "",
    apiKey: placeholder ? "" : key,
    keyLooksPlaceholder: Boolean(key) && placeholder,
    endpointDalamContoh: u.origin + u.pathname,
  };
}
