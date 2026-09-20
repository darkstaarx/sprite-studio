// Periksa post yang dijana terhadap peraturan yang playbook memang tetapkan.
// Model kadang abai arahan; ini yang menangkapnya sebelum sampai ke mata pengguna.

const FORMULA_AI = [
  { re: /\bDulu\b[^.!?]{0,60}\.\s*Sekarang\b/i, kata: '"Dulu X. Sekarang Y." — formula yang dah jadi tanda tulisan AI' },
  { re: /\bBukan sebab\b[^.!?]{0,60}\.\s*Sebab\b/i, kata: '"Bukan sebab A. Sebab B."' },
  { re: /\b(itu|tu) je bezanya\b/i, kata: '"Itu je bezanya."' },
  { re: /\bkau (dah )?tahu (apa )?(bunyi|maksud)/i, kata: '"Kau dah tahu apa maksudnya."' },
  { re: /dalam dunia yang serba pantas|tanpa disedari|kesimpulannya|marilah kita/i, kata: "ayat bunyi karangan sekolah" },
  { re: /\b(banget|nggak|gue|kayak|bikin|udah)\b/i, kata: "perkataan bahasa Indonesia" },
];
// Nada "kesian" dan ayat jualan keras — dua benda yang pembaca Threads Malaysia cepat rasa palsu.
const NADA_KESIAN = [
  { re: /\b(rasa bodoh|hampir menangis|air mata|sebak|kesian|menyesal seumur|hidup susah|terpaksa berhutang)\b/i, kata: "nada kesian atau merayu simpati" },
  { re: /\b(itulah pengajarannya|kadang(-kadang)? benda kecil|yang paling bermakna|moral(nya)?:)/i, kata: "ayat berfalsafah di hujung" },
];
// Tanda khusus post "lawak" yang ditulis mesin: pepatah reka sebagai pembuka,
// jenaka yang diterangkan sendiri pada baris kedua, dan ayat yang bercakap pasal
// kesan produk kepada "orang" dan bukan pengalaman penulis.
const PEPATAH = [
  /^(kalau|kalaulah|bila)\b[^.!?\n]{8,90}[,—-]\s*(jangan|usah|tak payah|takyah|tak perlu)\b/i,
  /^ada dua jenis (orang|manusia|kita)\b/i,
  /^bukan semua\b[^.!?\n]{5,70}\b(yang|akan|boleh)\b/i,
];
const TERANG = /^(itu|itulah|ini|inilah|rupanya|maksud aku)\b/i;
const ORANG_PERTAMA = /\b(aku|ku|kami|kita)\b/i;
const AYAT_IKLAN = [
  { re: /\bbuat orang (berhenti|tertarik|terpegun|pandang|berpaling)/i, kata: "kesan pada \"orang\", bukan apa yang jadi pada kau" },
  { re: /\bcukup (meyakinkan|realistik|menarik|kuat|bagus) untuk\b/i, kata: "ayat penerangan produk gaya katalog" },
  { re: /\b(menarik perhatian|mencuri perhatian|pilihan (terbaik|tepat))\b/i, kata: "bahasa iklan" },
];
const SENARAI_TIGA = /\b[\w-]+,\s*[\w-]+\s+dan\s+[\w-]+\b/;
const AYAT_APP = /\blink\s+(dalam|dlm|di|kat)\s+(balasan|reply)\s*(pertama|1)?\b/i;
const GAYA_BERWATAK = /lawak|circle|cerita|review/i;
const JUALAN_KERAS = /\b(jangan lepaskan peluang|dapatkan sekarang|stok terhad|buruan|cepat sebelum habis|jangan tunggu lagi|terhad sahaja)\b/i;
const SALAM = /^\s*(hai|helo|hello|assalamualaikum|salam)\b/i;
const HARGA = /\bRM\s?\d|\b\d+\s?ringgit\b/i;
const HARGA_KABUR = /\b(murah|berbaloi|tak mahal|jimat duit|bajet)\b/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const JULAT = { pendek: [80, 200], sederhana: [180, 380], panjang: [330, 500] };

/** Balik senarai masalah. Kosong bermakna post itu lulus. */
export function lintPost(post, { sebutHarga = false, panjang = "sederhana", had = 500, angle = "" } = {}) {
  const teks = String(post?.caption || post?.text || "").trim();
  const isu = [];
  if (!teks) return [{ kod: "kosong", pesan: "Post kosong." }];

  const barisPertama = teks.split("\n")[0].trim();
  if (teks.length > had) isu.push({ kod: "panjang", pesan: `${teks.length} aksara, melebihi had ${had}.` });
  const [min, max] = JULAT[panjang] || JULAT.sederhana;
  if (teks.length < min) isu.push({ kod: "terlalu-pendek", pesan: `${teks.length} aksara — brief minta sekitar ${min}-${max}.` });
  if (teks.length > max && teks.length <= had) isu.push({ kod: "terlalu-panjang", pesan: `${teks.length} aksara — brief minta sekitar ${min}-${max}.` });

  if (SALAM.test(barisPertama)) isu.push({ kod: "salam", pesan: "Baris pertama mula dengan sapaan." });
  if (EMOJI.test(barisPertama)) isu.push({ kod: "emoji-hook", pesan: "Ada emoji dalam baris pertama." });
  if (barisPertama.split(/\s+/).length > 18) isu.push({ kod: "hook-panjang", pesan: "Baris pertama terlalu panjang untuk jadi hook." });

  if (!sebutHarga && HARGA.test(teks)) isu.push({ kod: "harga-bocor", pesan: "Harga disebut, sedangkan brief mahu pembaca klik untuk tahu." });
  if (!sebutHarga && HARGA_KABUR.test(teks)) isu.push({ kod: "harga-kabur", pesan: "Guna perkataan yang mengunci jangkaan harga (murah/berbaloi/bajet)." });

  for (const f of FORMULA_AI) if (f.re.test(teks)) isu.push({ kod: "formula-ai", pesan: `Guna ${f.kata}` });
  for (const n of NADA_KESIAN) if (n.re.test(teks)) isu.push({ kod: "nada-kesian", pesan: `Guna ${n.kata} — nada sepatutnya rilek.` });
  if (JUALAN_KERAS.test(teks)) isu.push({ kod: "jualan-keras", pesan: "Ayat jualan keras. Ganti dengan ajakan santai." });

  const bilanganEmoji = (teks.match(new RegExp(EMOJI, "gu")) || []).length;
  if (bilanganEmoji > 2) isu.push({ kod: "emoji-banyak", pesan: `${bilanganEmoji} emoji — maksimum 2.` });

  const hashtag = (teks.match(/#\w+/g) || []).length;
  if (hashtag > 1) isu.push({ kod: "hashtag", pesan: `${hashtag} hashtag — Threads endah satu sahaja.` });

  if (PEPATAH.some(re => re.test(barisPertama))) {
    isu.push({ kod: "pepatah", pesan: "Baris pertama berbentuk pepatah reka. Orang tak taip pepatah — mula dengan babak yang betul-betul berlaku." });
  }
  const baris = teks.split("\n").map(b => b.trim()).filter(Boolean);
  if (baris[1] && TERANG.test(baris[1]) && !ORANG_PERTAMA.test(barisPertama)) {
    isu.push({ kod: "terang-jenaka", pesan: "Baris pertama jadi teka-teki, baris kedua terangkan maksudnya. Jenaka mati bila diterangkan — buang teka-teki tu." });
  }
  const gaya = String(post?.angle || angle || "");
  if (GAYA_BERWATAK.test(gaya) && !ORANG_PERTAMA.test(teks)) {
    isu.push({ kod: "tiada-aku", pesan: "Tiada \"aku\" langsung — post ni tiada sesiapa di dalamnya. Gaya cerita dan lawak mesti ada kau sebagai watak." });
  }
  for (const a of AYAT_IKLAN) if (a.re.test(teks)) isu.push({ kod: "ayat-iklan", pesan: `Guna ${a.kata}.` });
  if (SENARAI_TIGA.test(teks)) isu.push({ kod: "senarai-tiga", pesan: "Senarai tiga benda dalam satu ayat (X, Y dan Z) — irama iklan. Buang satu atau pecahkan." });
  if (AYAT_APP.test(teks)) isu.push({ kod: "ayat-app", pesan: "\"Link dalam balasan pertama\" ialah arahan sistem, bukan ayat manusia. Balasan tu keluar sendiri — tak payah umum." });

  if (/\[[A-Z][A-Z \/]+\]/.test(teks)) isu.push({ kod: "placeholder", pesan: "Ada placeholder dalam kurungan yang belum diisi." });
  if (/https?:\/\//i.test(teks)) isu.push({ kod: "link-dalam-post", pesan: "Link sepatutnya duduk dalam balasan pertama, bukan dalam post." });

  return isu;
}

/** Ringkaskan isu semua post jadi arahan pembetulan untuk model. */
export function arahanBetulkan(hasil) {
  const baris = hasil
    .filter(h => h.isu.length)
    .map(h => `Post ${h.index + 1}: ${h.isu.map(i => i.pesan).join(" ")}`);
  if (!baris.length) return "";
  return [
    "Post di bawah melanggar peraturan yang aku dah beri. Tulis semula SEMUA post,",
    "betulkan masalah yang disenaraikan, kekalkan idea asal, dan balas JSON sahaja dengan bentuk yang sama.",
    "",
    ...baris,
  ].join("\n");
}
