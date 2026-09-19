// Kesan produk dari link: buka link pendek, ambil metadata halaman, pulangkan brief separa siap.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TIMEOUT_MS = Number(process.env.DETECT_TIMEOUT_MS || 12000);
const MAX_BYTES = 2_000_000;

export const MARKETS = [
  { id: "shopee",  test: /(^|\.)shopee\.|(^|\.)shp\.ee$/i,               label: "Shopee" },
  { id: "lazada",  test: /(^|\.)lazada\./i,                              label: "Lazada" },
  { id: "tiktok",  test: /(^|\.)tiktok\.com$|(^|\.)vt\.tiktok\.com$/i,   label: "TikTok Shop" },
  { id: "temu",    test: /(^|\.)temu\./i,                                label: "Temu" },
  { id: "shein",   test: /(^|\.)shein\./i,                               label: "Shein" },
  { id: "involve", test: /(^|\.)invol\.co$|(^|\.)involve\.asia$/i,       label: "Involve Asia" },
];

export function market(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch { return { id: "lain", label: "Tidak dikenali" }; }
  return MARKETS.find(m => m.test.test(host)) || { id: "lain", label: host };
}

/** Ikut redirect satu per satu supaya link pendek/affiliate terbuka. */
export async function resolve(url, { maxHops = 6, fetchImpl = fetch } = {}) {
  const hops = [];
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    let res;
    try {
      res = await fetchImpl(current, {
        redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": UA, "accept-language": "ms-MY,ms;q=0.9,en;q=0.8" },
      });
    } catch (e) { return { url: current, hops, error: e.message }; }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      hops.push(current);
      current = new URL(loc, current).toString();
      continue;
    }
    return { url: current, hops, status: res.status };
  }
  return { url: current, hops, warning: "terlalu banyak redirect" };
}

async function fetchHtml(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml", "accept-language": "ms-MY,ms;q=0.9,en;q=0.8" },
  });
  const text = (await res.text()).slice(0, MAX_BYTES);
  return { status: res.status, html: text };
}

/** Ambil semua <meta> og:/twitter:/product: tanpa kira susunan atribut. */
export function metaTags(html) {
  const out = {};
  const re = /<meta\b[^>]*>/gi;
  for (const tag of html.match(re) || []) {
    const key = (tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && val != null && out[key] == null) out[key] = decodeEntities(val.trim());
  }
  return out;
}

/** Cari objek Product dalam mana-mana blok JSON-LD. */
export function jsonLdProduct(html) {
  const blocks = [...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    let data;
    try { data = JSON.parse(raw.trim()); } catch { continue; }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
      const type = [].concat(node["@type"] || []);
      if (type.some(t => String(t).toLowerCase() === "product")) return node;
      for (const v of Object.values(node)) if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

const decodeEntities = s => String(s)
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");

const firstImage = v => Array.isArray(v) ? firstImage(v[0]) : (v && typeof v === "object" ? (v.url || v.contentUrl || "") : (v || ""));

export function priceFrom(meta, ld) {
  const offers = ld?.offers ? [].concat(ld.offers)[0] : null;
  const amount = offers?.price ?? offers?.lowPrice ?? meta["product:price:amount"] ?? meta["og:price:amount"] ?? null;
  const cur = offers?.priceCurrency ?? meta["product:price:currency"] ?? meta["og:price:currency"] ?? "";
  if (amount == null || amount === "") return "";
  const n = Number(String(amount).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  const symbol = cur === "MYR" ? "RM" : cur ? cur + " " : "RM";
  const high = offers?.highPrice ? Number(String(offers.highPrice).replace(/[^\d.]/g, "")) : null;
  const one = symbol + n.toFixed(2).replace(/\.00$/, "");
  return high && high > n ? `${one} – ${symbol}${high.toFixed(2).replace(/\.00$/, "")}` : one;
}

/** Nama dari slug URL — sandaran bila halaman tak boleh dibaca. */
export function slugName(url) {
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname).split("/").filter(Boolean).pop() || "";
    const m = seg.match(/^(.+?)-i\.\d+\.\d+/) || seg.match(/^(.+?)-i\d+-s\d+/) || seg.match(/^(.+?)-g-\d+/);
    if (!m) return "";
    return m[1].replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  } catch { return ""; }
}

const BLOCK_HINTS = /captcha|are you a robot|access denied|unusual traffic|verify you are human|请验证/i;

/**
 * Kesan produk dari satu link.
 * Link asal (termasuk kod affiliate kau) sentiasa dikekalkan dalam `affiliateUrl`.
 */
export async function detect(inputUrl, { fetchImpl = fetch, debug = false } = {}) {
  const warnings = [];
  let parsed;
  try { parsed = new URL(inputUrl); } catch { return { ok: false, error: "Link tak sah." }; }

  const resolved = await resolve(parsed.toString(), { fetchImpl });
  const finalUrl = resolved.url;
  const mk = market(finalUrl).id === "lain" ? market(parsed.toString()) : market(finalUrl);
  if (resolved.error) warnings.push(`Tak dapat buka link: ${resolved.error}`);
  if (resolved.warning) warnings.push(resolved.warning);

  let html = "", status = resolved.status ?? 0, fetchError = null;
  if (!resolved.error) {
    try { ({ html, status } = await fetchHtml(finalUrl, fetchImpl)); }
    catch (e) { fetchError = e.message; warnings.push(`Tak dapat baca halaman: ${e.message}`); }
  }
  if (status && status >= 400) warnings.push(`Halaman balas ${status} — marketplace mungkin block bacaan automatik.`);
  if (html && BLOCK_HINTS.test(html.slice(0, 20000))) warnings.push("Marketplace papar skrin pengesahan (captcha) — isi butiran manual.");

  const meta = html ? metaTags(html) : {};
  const ld = html ? jsonLdProduct(html) : null;

  const name = (ld?.name || meta["og:title"] || meta["twitter:title"] || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || slugName(finalUrl) || "")
    .replace(/\s*\|\s*Shopee.*$/i, "").replace(/\s*-\s*Lazada.*$/i, "").trim();
  const price = priceFrom(meta, ld);
  const image = firstImage(ld?.image) || meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || "";
  const description = (ld?.description || meta["og:description"] || meta["description"] || "").trim();

  const source = ld ? "json-ld" : (meta["og:title"] ? "og-tags" : (name ? "slug-url" : "tiada"));
  if (!name) warnings.push("Nama produk tak dapat dikesan — isi manual.");
  else if (source === "slug-url") warnings.push("Nama diambil dari URL sahaja, bukan dari halaman produk — sahkan ejaannya.");
  if (!price) warnings.push("Harga tak dapat dikesan — isi manual (penting untuk ayat kiraan harga).");

  const confidence = ld ? "tinggi" : (meta["og:title"] ? "sederhana" : (name ? "rendah" : "tiada"));
  const out = {
    // ok = betul-betul dibaca dari halaman produk. Nama dari slug URL sahaja tak cukup.
    ok: Boolean(name) && (source === "json-ld" || source === "og-tags"),
    hasName: Boolean(name),
    confidence,
    affiliateUrl: parsed.toString(),          // link kau, dengan kod affiliate, tak disentuh
    resolvedUrl: finalUrl,
    marketplace: mk.label, marketplaceId: mk.id,
    name, price, image, description: description.slice(0, 600),
    source, warnings,
  };
  if (debug) {
    out.debug = {
      hops: resolved.hops.length,
      redirectChain: [parsed.toString(), ...resolved.hops.slice(1), finalUrl].slice(0, 8),
      status, fetchError, htmlBytes: html.length,
      title: (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim().slice(0, 120) || "",
      metaKeys: Object.keys(meta).filter(k => /^(og:|twitter:|product:|description$)/.test(k)).slice(0, 20),
      hasJsonLd: Boolean(ld),
      jsonLdKeys: ld ? Object.keys(ld).slice(0, 15) : [],
      looksBlocked: Boolean(html && BLOCK_HINTS.test(html.slice(0, 20000))),
      snippet: html.replace(/\s+/g, " ").slice(0, 300),
    };
  }
  return out;
}
