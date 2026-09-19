// Terjemah ralat pembekal kepada ayat yang boleh ditindak.
// Kod ini mengikut corak yang lazim pada gateway OpenAI-compatible.
const CODE = {
  invalid_api_key: "Kunci API salah atau belum wujud. Salin semula dari dashboard pembekal.",
  insufficient_credits: "Kredit tak cukup. Top up dulu di dashboard pembekal.",
  key_expired: "Kunci API dah luput. Buat kunci baharu.",
  account_disabled: "Akaun pembekal dimatikan.",
  email_not_verified: "Emel akaun pembekal belum disahkan.",
  model_not_found: "Nama model tak wujud. Guna id tepat dari senarai model pembekal (contoh asai/gpt-5.6-sol), bukan nama paparan.",
  rate_limit_exceeded: "Terlalu banyak permintaan seminit. Tunggu sekejap, lepas tu cuba lagi.",
  concurrency_limit_exceeded: "Terlalu banyak permintaan serentak. Jana lebih sedikit post sekali gus.",
  model_disabled: "Model tu dimatikan sementara oleh pembekal.",
  gateway_paused: "Pembekal memberhentikan inferens buat sementara.",
  upstream_unavailable: "Pembekal tak dapat menghubungi model sekarang. Cuba lagi sekejap.",
  accounting_unavailable: "Sistem kredit pembekal tak tersedia sekarang.",
};
const STATUS = {
  400: "Permintaan ditolak — biasanya nama model atau bentuk permintaan tak kena.",
  401: "Kunci API ditolak.",
  402: "Kredit tak cukup.",
  403: "Akses ditolak oleh pembekal.",
  404: "Alamat atau model tak dijumpai.",
  429: "Had kadar pembekal tercapai.",
  500: "Pembekal bermasalah di pihak mereka.",
  502: "Pembekal bermasalah di pihak mereka.",
  503: "Perkhidmatan pembekal tak tersedia sekarang.",
};

export function explain(status, json, text = "") {
  const err = json?.error || json || {};
  const code = err.code || err.type;
  const mesej = err.message || String(text || "").slice(0, 160);
  const ayat = (code && CODE[code]) || STATUS[status] || "Pembekal tolak permintaan.";
  const ekor = mesej && !ayat.includes(mesej) ? ` (${mesej})` : "";
  return `${status}${code ? " " + code : ""} — ${ayat}${ekor}`;
}
