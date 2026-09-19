import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { detect, metaTags, jsonLdProduct, priceFrom, slugName, market } from "../lib/detect.mjs";

// Kedai palsu tempatan: link pendek -> redirect -> halaman produk.
const PRODUK = `<!doctype html><html><head>
<title>Air Fryer 5L Digital Rangup | Shopee Malaysia</title>
<meta property="og:title" content="Air Fryer 5L Digital Rangup">
<meta name="og:description" content="Air fryer 5 liter, basket non-stick, muat ayam sebiji.">
<meta property="og:image" content="https://cdn.contoh/air-fryer.jpg">
<meta property="product:price:amount" content="89.00">
<meta property="product:price:currency" content="MYR">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Air Fryer 5L Digital Rangup",
 "image":["https://cdn.contoh/air-fryer-1.jpg"],"description":"Basket non-stick, muat ayam sebiji.",
 "offers":{"@type":"Offer","price":"89.00","priceCurrency":"MYR"}}
</script></head><body>...</body></html>`;

const CAPTCHA = `<!doctype html><html><head><title>Verify</title></head><body>Please verify you are human</body></html>`;

let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url.startsWith("/s/")) { res.writeHead(302, { location: `${base}/Air-Fryer-5L-Digital-Rangup-i.123.456` }); return res.end(); }
    if (req.url.startsWith("/hop/")) { res.writeHead(301, { location: `${base}/s/abc` }); return res.end(); }
    if (req.url.startsWith("/blocked")) { res.writeHead(403, { "content-type": "text/html" }); return res.end(CAPTCHA); }
    if (req.url.startsWith("/kosong")) { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><head></head><body>tiada apa</body></html>"); }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(PRODUK);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("metaTags baca kedua-dua susunan atribut", () => {
  const m = metaTags(PRODUK);
  assert.equal(m["og:title"], "Air Fryer 5L Digital Rangup");
  assert.equal(m["og:description"], "Air fryer 5 liter, basket non-stick, muat ayam sebiji.");
  assert.equal(m["product:price:amount"], "89.00");
});

test("jsonLdProduct jumpa Product dalam @graph dan array", () => {
  const wrapped = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"X"}]}</script>`;
  assert.equal(jsonLdProduct(wrapped).name, "X");
  const arr = `<script type="application/ld+json">[{"@type":"Product","name":"Y"}]</script>`;
  assert.equal(jsonLdProduct(arr).name, "Y");
  assert.equal(jsonLdProduct("<p>tiada</p>"), null);
});

test("priceFrom format MYR jadi RM dan sokong julat", () => {
  assert.equal(priceFrom({}, { offers: { price: "89.00", priceCurrency: "MYR" } }), "RM89");
  assert.equal(priceFrom({ "product:price:amount": "149.50", "product:price:currency": "MYR" }, null), "RM149.50");
  assert.equal(priceFrom({}, { offers: { lowPrice: "89", highPrice: "129", priceCurrency: "MYR" } }), "RM89 – RM129");
  assert.equal(priceFrom({}, null), "");
});

test("slugName dan market kenal pasaran Malaysia", () => {
  assert.equal(slugName("https://shopee.com.my/Air-Fryer-5L-i.1.2"), "Air Fryer 5L");
  assert.equal(slugName("https://www.lazada.com.my/products/air-fryer-5l-i123-s456.html"), "air fryer 5l");
  assert.equal(slugName("https://shopee.com.my/r/x/Air-Fryer-5L-i.1.2"), "Air Fryer 5L", "abaikan segmen di hadapan");
  assert.equal(market("https://s.shopee.com.my/abc").label, "Shopee");
  assert.equal(market("https://vt.tiktok.com/abc").label, "TikTok Shop");
  assert.equal(market("https://invol.co/abc").label, "Involve Asia");
});

test("detect ikut link pendek dan tarik nama, harga, gambar", async () => {
  const r = await detect(`${base}/hop/xyz`);
  assert.equal(r.ok, true);
  assert.equal(r.name, "Air Fryer 5L Digital Rangup");
  assert.equal(r.price, "RM89");
  assert.equal(r.image, "https://cdn.contoh/air-fryer-1.jpg");
  assert.equal(r.source, "json-ld");
  assert.match(r.resolvedUrl, /Air-Fryer-5L-Digital-Rangup-i\.123\.456$/);
  assert.equal(r.affiliateUrl, `${base}/hop/xyz`, "link affiliate asal mesti kekal");
  assert.deepEqual(r.warnings, []);
});

test("detect bagi amaran bila marketplace block", async () => {
  const r = await detect(`${base}/blocked/Air-Fryer-5L-i.1.2`);
  assert.ok(r.warnings.some(w => /403/.test(w)), "sebut status 403");
  assert.ok(r.warnings.some(w => /captcha/i.test(w)), "sebut captcha");
});

test("detect jatuh balik ke nama dari slug bila halaman kosong", async () => {
  const r = await detect(`${base}/kosong/Air-Fryer-5L-Digital-i.9.9`);
  assert.equal(r.source, "slug-url");
  assert.equal(r.name, "Air Fryer 5L Digital", "ambil segmen terakhir, bukan seluruh laluan");
  assert.equal(r.price, "");
  assert.ok(r.warnings.some(w => /Harga tak dapat dikesan/.test(w)));
});

test("detect tolak link tak sah tanpa melempar", async () => {
  assert.equal((await detect("bukan-link")).ok, false);
});
