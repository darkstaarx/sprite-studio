// Penjana ayat: bina prompt dari base-prompt.md + brief, panggil LLM, parse JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { platform as plat } from "./platforms.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = path.join(HERE, "..", "prompts");
const BASE_PROMPT_FILE = path.join(PROMPT_DIR, "base-prompt.md");
const promptFile = name => name === "base" ? BASE_PROMPT_FILE : path.join(PROMPT_DIR, "platforms", `${name}.md`);
const SAFE_NAME = /^[a-z0-9-]{1,32}$/;

export const ANGLES = {
  "review-jujur":   { label: "Review jujur", shape: "Pengakuan jujur → apa yang aku suka → satu kelemahan kecil → siapa patut beli" },
  "masalah-selesai":{ label: "Masalah → selesai", shape: "Sebut masalah tepat → besarkan sedikit → tunjuk penyelesaian → CTA" },
  "before-after":   { label: "Before → after", shape: "Keadaan sebelum → titik perubahan → keadaan sekarang → CTA" },
  "harga-shock":    { label: "Harga shock", shape: "Teka harga → dedah harga → pecah kos per hari → CTA" },
  "myth":           { label: "Pecah mitos", shape: "Mitos biasa → kenapa salah → apa yang betul → CTA" },
  "pov":            { label: "POV relatable", shape: "POV pendek → babak harian → produk masuk semula jadi → CTA" },
  "listicle":       { label: "Listicle", shape: "Janji nombor → item laju → item terakhir paling kuat → CTA" },
  "cerita":         { label: "Storytelling", shape: "Babak pembuka → konflik kecil → penyelesaian → pelajaran + CTA" },
  "objection":      { label: "Lawan keberatan", shape: "Sebut keberatan pembeli → jawab dengan pengalaman → CTA lembut" },
  "demo":           { label: "Demo pantas", shape: "Apa yang aku tunjuk → langkah 1-3 → hasil depan mata → CTA" },
};

export const WORDS = { 15: "35-45", 30: "70-85", 45: "105-120", 60: "140-160" };

export function readBasePrompt() {
  try { return fs.readFileSync(BASE_PROMPT_FILE, "utf8"); }
  catch { return "Tulis ayat pendek, jujur, bahasa Melayu Malaysia. Balas JSON {\"posts\":[...]}."; }
}
export function writeBasePrompt(text) {
  fs.writeFileSync(BASE_PROMPT_FILE, text);
}

/** Playbook khusus platform, kalau ada. Ditambah selepas base prompt. */
export function readPlaybook(id) {
  if (!SAFE_NAME.test(id)) return "";
  try { return fs.readFileSync(promptFile(id), "utf8"); } catch { return ""; }
}

/** Semua fail otak yang boleh diedit: base + setiap playbook platform. */
export function listPrompts() {
  const out = [{ name: "base", label: "Base prompt (semua platform)" }];
  try {
    for (const f of fs.readdirSync(path.join(PROMPT_DIR, "platforms"))) {
      if (f.endsWith(".md")) out.push({ name: f.replace(/\.md$/, ""), label: `Playbook ${f.replace(/\.md$/, "")}` });
    }
  } catch { /* tiada folder platforms */ }
  return out;
}

export function readPrompt(name) {
  if (!SAFE_NAME.test(name)) throw new Error("Nama prompt tak sah.");
  return name === "base" ? readBasePrompt() : readPlaybook(name);
}

export function writePrompt(name, text) {
  if (!SAFE_NAME.test(name)) throw new Error("Nama prompt tak sah.");
  const file = promptFile(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Bina arahan brief (bahagian yang berubah setiap kali jana). */
export function buildBrief(brief, platforms, count) {
  const lines = [];
  const list = v => (Array.isArray(v) ? v : String(v || "").split("\n"))
    .map(s => String(s).trim()).filter(Boolean);

  lines.push("## Brief");
  const mode = brief.mode || "affiliate";
  lines.push(mode === "affiliate" ? "Jenis: affiliate — produk orang lain, kau dapat komisen."
    : mode === "bisnes" ? "Jenis: bisnes sendiri — tulis dengan suara pemilik."
    : "Jenis: organik — bina audience dulu, tawaran disebut ringan di hujung.");
  lines.push(`Nama: ${brief.nama || "[NAMA PRODUK]"}`);
  if (brief.harga) lines.push(`Harga/promo: ${brief.harga}`);
  if (brief.niche) lines.push(`Niche: ${brief.niche}`);
  if (brief.link) lines.push(`Link: ${brief.link}`);
  const kel = list(brief.kelebihan);
  if (kel.length) lines.push(`Kelebihan sebenar:\n${kel.map(k => "- " + k).join("\n")}`);
  if (brief.keterangan) lines.push(`Keterangan dari halaman produk (bahan mentah — jangan salin bulat-bulat, dan jangan percaya bulat-bulat kalau ia bunyi macam iklan):\n"""${brief.keterangan}"""`);
  if (brief.masalah) lines.push(`Masalah audience: ${brief.masalah}`);
  if (brief.bukti) lines.push(`Pengalaman peribadi aku: ${brief.bukti}`);
  if (brief.cerita) lines.push(`Cerita sebenar untuk dipakai (guna butirannya bulat-bulat — masa, tempat, orang, dialog. Jangan cantikkan sampai hilang keaslian):\n"""${brief.cerita}"""`);
  else lines.push("Tiada cerita sebenar diberi: jangan reka pengalaman peribadi. Tulis dari pemerhatian, soalan, atau penjelasan — dan tinggalkan [kurungan] kalau satu butiran peribadi memang diperlukan.");
  lines.push(`Audience: ${brief.audience || "pengguna media sosial Malaysia, 25-40"}`);
  lines.push(`Bahasa: ${BAHASA[brief.bahasa] || BAHASA["bm-santai"]}`);
  if (brief.tone) lines.push(`Tone: ${brief.tone}`);
  lines.push(`CTA: ${brief.cta || "ajak tengok link, sekali sahaja"}`);
  if (brief.durasi) lines.push(`Panjang skrip video: ${brief.durasi} saat (${WORDS[brief.durasi] || "70-85"} patah untuk bahagian dilafaz).`);
  if (brief.larangan) lines.push(`Arahan tambahan: ${brief.larangan}`);

  const angles = (brief.angles || []).filter(a => ANGLES[a]);
  if (angles.length) {
    lines.push("", "## Angle yang diminta (jangan ulang hook yang sama)");
    angles.forEach(a => lines.push(`- ${ANGLES[a].label}: ${ANGLES[a].shape}`));
  }

  lines.push("", "## Platform");
  platforms.forEach(p => lines.push(`- ${p} (${plat(p).label}, had ${plat(p).limit} aksara): ${plat(p).style}`));

  lines.push("", `## Tugas`,
    `Hasilkan ${count} post. Agih-agihkan antara platform di atas.`,
    `Balas JSON sahaja mengikut kontrak output dalam arahan gaya.`);
  return lines.join("\n");
}

export const BAHASA = {
  "bm-santai": "Bahasa Melayu santai harian Malaysia, boleh selit English ringan yang memang orang guna.",
  "bm-baku": "Bahasa Melayu lebih baku dan sopan, tiada slanga berat.",
  "bm-eng": "Campuran BM + English gaya bandar, code-switch semula jadi.",
  "eng": "English, casual Malaysian tone, short sentences.",
};

/** Panggil LLM ikut tetapan. Provider 'local' = penjana templat tanpa API. */
export async function generate({ settings, brief, platforms, count }) {
  const pf = platforms?.length ? platforms : ["threads"];
  const n = Math.max(1, Math.min(10, count || 3));
  const provider = settings?.llm?.provider || "local";
  const briefText = buildBrief(brief, pf, n);
  const playbooks = pf.map(id => readPlaybook(id)).filter(Boolean).join("\n\n---\n\n");
  const prompt = [readBasePrompt(), playbooks, briefText].filter(Boolean).join("\n\n---\n\n");

  if (provider === "local") return { posts: localPosts(brief, pf, n), provider: "local", prompt };

  const { baseUrl, model, apiKey, temperature } = settings.llm;
  if (!baseUrl || !model) throw new Error("Tetapan LLM belum lengkap (baseUrl + model).");
  let url, headers, body;
  if (provider === "anthropic") {
    url = baseUrl.replace(/\/+$/, "") + "/v1/messages";
    headers = { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    body = { model, max_tokens: 4000, temperature: temperature ?? 0.9, messages: [{ role: "user", content: prompt }] };
  } else {
    url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
    headers = { "content-type": "application/json", ...(apiKey ? { authorization: "Bearer " + apiKey } : {}) };
    body = { model, temperature: temperature ?? 0.9, messages: [{ role: "user", content: prompt }] };
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(json.error?.message || JSON.stringify(json)).slice(0, 300)}`);
  const text = json.content?.map(c => c.text).filter(Boolean).join("\n")
    || json.choices?.[0]?.message?.content || "";
  const posts = parsePosts(text);
  if (!posts.length) throw new Error("LLM balas tanpa post yang boleh dibaca.");
  return { posts, provider, prompt, raw: text };
}

/** Parse JSON walaupun model bungkus dengan pagar kod atau teks sekitar. */
export function parsePosts(text) {
  if (!text) return [];
  const tries = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const span = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (span) tries.push(span);
  tries.push(text);
  for (const t of tries) {
    try {
      const obj = JSON.parse(t);
      const arr = Array.isArray(obj) ? obj : obj.posts;
      if (Array.isArray(arr)) return arr.map(normalisePost).filter(p => p.caption);
    } catch { /* cuba seterusnya */ }
  }
  return [];
}

function normalisePost(p = {}) {
  const tags = Array.isArray(p.hashtags) ? p.hashtags
    : String(p.hashtags || "").split(/\s+/).filter(Boolean);
  const caption = String(p.caption || [p.hook, p.body, p.cta].filter(Boolean).join("\n\n") || "").trim();
  const extra = tags.filter(t => t && !caption.toLowerCase().includes(String(t).toLowerCase()));
  return {
    platform: String(p.platform || "threads").toLowerCase().replace(/\s+/g, ""),
    angle: p.angle || "",
    hook: p.hook || "", body: p.body || "", cta: p.cta || "",
    broll: Array.isArray(p.broll) ? p.broll : String(p.broll || "").split(";").map(s => s.trim()).filter(Boolean),
    reply: String(p.reply || "").trim(),
    visual: String(p.visual || "").trim(),
    hashtags: tags,
    caption: extra.length ? `${caption}\n\n${extra.join(" ")}` : caption,
  };
}

/** Penjana tanpa API: templat, supaya app berguna sebelum kau ada key. */
function localPosts(brief, platforms, n) {
  const nama = brief.nama || "[NAMA PRODUK]";
  const harga = brief.harga || "[HARGA]";
  const kel = (Array.isArray(brief.kelebihan) ? brief.kelebihan : String(brief.kelebihan || "").split("\n"))
    .map(s => s.trim()).filter(Boolean);
  const masalah = brief.masalah || "[MASALAH AUDIENCE]";
  const cta = brief.cta || "Link dalam bio.";
  const shapes = [
    () => ({ angle: "Review jujur", hook: `Aku guna ${nama} sebelum aku cakap apa-apa pasal dia.`,
      body: `${kel[0] || "[KELEBIHAN 1]"}.\n${kel[1] || "[KELEBIHAN 2]"}.\nYang aku tak suka: [KELEMAHAN KECIL].` }),
    () => ({ angle: "Masalah → selesai", hook: `${masalah}.`,
      body: `Itu masalah aku dulu.\n${nama} yang tukar benda tu.\n${kel[0] || "[KELEBIHAN 1]"}.` }),
    () => ({ angle: "Harga shock", hook: `${harga}. Tu je.`,
      body: `Aku sangka kena bayar lebih.\n${kel[0] || "[KELEBIHAN 1]"}.\nKira balik per hari, ia [KOS/HARI].` }),
    () => ({ angle: "Lawan keberatan", hook: `"Mahal." Tu benda pertama aku fikir juga.`,
      body: `Lepas [TEMPOH] guna, kiraan aku berubah.\n${kel[0] || "[KELEBIHAN 1]"}.` }),
    () => ({ angle: "Demo pantas", hook: `Aku tunjuk sekali guna, ${brief.durasi || 30} saat.`,
      body: `Langkah 1: [LANGKAH].\nLangkah 2: [LANGKAH].\nHasil: ${kel[0] || "[HASIL]"}.` }),
  ];
  // Threads: lagi pendek, tiada hashtag, link duduk dalam balasan pertama.
  // needsPrice menandakan rangka yang memang berpaksi harga — digugurkan bila harga tiada.
  const threadShapes = [
    { needsPrice: true, make: () => ({ angle: "Hot take", hook: `${harga} untuk ${nama}.`,
      body: `Aku sangka benda murah macam ni tak jalan.\n${kel[0] || "[KELEBIHAN 1]"}.`,
      reply: `Link affiliate dia di sini kalau nak: ${brief.link || "[LINK]"} #ad` }) },
    { needsPrice: false, make: () => ({ angle: "Aku silap", hook: `Aku beli yang mahal dulu. Buang duit.`,
      body: `${nama} buat kerja yang sama.\n${kel[0] || "[KELEBIHAN 1]"}.`,
      reply: `Ada yang tanya link — ni dia: ${brief.link || "[LINK]"} (link affiliate)` }) },
    { needsPrice: true, make: () => ({ angle: "Kiraan", hook: `${harga} dibahagi [TEMPOH] = [KOS] sehari.`,
      body: `Aku belanja lebih pada teh ais.\n${kel[0] || "[KELEBIHAN 1]"}.`,
      reply: `Link: ${brief.link || "[LINK]"} #ad` }) },
    { needsPrice: false, make: () => ({ angle: "Soalan jujur", hook: `Korang yang dah guna ${nama} — memang tahan lama ke?`,
      body: `Aku baru [TEMPOH]. Setakat ni ${kel[0] ? kel[0].toLowerCase() : "[KELEBIHAN 1]"}.`,
      reply: `Kalau nak tahu yang mana aku beli, cakap je.` }) },
    { needsPrice: false, make: () => ({ angle: "Babak pendek", hook: `${masalah}.`,
      body: `Itu rumah aku tiap malam sebelum ni.\n${nama} yang tukar benda tu.`,
      reply: `Link affiliate: ${brief.link || "[LINK]"} #ad` }) },
    { needsPrice: false, make: () => ({ angle: "Lawan keberatan", hook: `"Mesti susah nak guna." Aku pun fikir macam tu.`,
      body: `${kel[0] || "[KELEBIHAN 1]"}.\n${kel[1] || "[KELEBIHAN 2]"}.\nItu je. Tiada bab belajar lama.`,
      reply: `Link: ${brief.link || "[LINK]"} #ad` }) },
  ];
  // Tanpa harga, rangka berasaskan harga cuma hasilkan "[HARGA]. Tu je." — jadi ia digugurkan.
  const usableThreadShapes = threadShapes.filter(s => brief.harga || !s.needsPrice).map(s => s.make);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = platforms[i % platforms.length];
    if (p === "threads") {
      const t = usableThreadShapes[i % usableThreadShapes.length]();
      out.push(normalisePost({
        platform: p, angle: t.angle, hook: t.hook, body: t.body, cta: "",
        caption: `${t.hook}\n\n${t.body}`.slice(0, 500),
        reply: t.reply, visual: "gambar produk atas meja, cahaya siang, tiada filter",
        hashtags: [], broll: [],
      }));
      continue;
    }
    const s = shapes[i % shapes.length]();
    out.push(normalisePost({
      platform: p, angle: s.angle, hook: s.hook, body: s.body, cta,
      caption: `${s.hook}\n\n${s.body}\n\n${cta}`,
      hashtags: ["#ad"],
      broll: plat(p).media === "required" ? ["shot produk dekat", "babak guna", "reaksi hasil"] : [],
    }));
  }
  return out;
}
