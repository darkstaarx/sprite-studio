# SkripGun

Versi minimalist, untuk kegunaan sendiri, bagi apa yang [ViralKaya](https://viralkaya.com/) jual:
**tampal link produk → dapat skrip viral TikTok / Threads / Facebook / Reels dalam BM atau English.**
Bezanya SkripGun tak jual langganan, tak ada backend, dan dia sambung terus ke
**Metricool** untuk jadual & publish.

Satu fail: [`index.html`](index.html). Buka je dalam browser (double-click pun jadi).
Semua brief, barisan post dan tetapan duduk dalam `localStorage` browser kau — tiada server, tiada akaun.

## ViralKaya auto-post ke?

Tidak. Setakat maklumat awam yang ada, ViralKaya jana **skrip + caption** sahaja —
posting kau buat sendiri. Sebab itu gabungan `SkripGun → Metricool` masuk akal:

```
brief produk ─► prompt ─► LLM (Claude/Hermes/apa saja) ─► caption + skrip
                                                            │
                                    ┌───────────────────────┴───────────────┐
                                    ▼                                       ▼
                        CSV import (semua plan)                 Scheduler API (plan berbayar)
                                    └──────────────► Metricool ──────► auto-publish
```

Yang perlu kau buat sendiri tetap sama: rakam video. Teks, caption, hashtag, jadual — automatik.

## Aliran kerja

1. **Tab 1 · Brief** — tampal link produk (Shopee/Lazada/TikTok Shop/Temu; nama produk ditarik dari
   slug URL), pilih platform, angle hook, bahasa, tone, panjang video, bilangan variasi.
2. **Tab 2 · Prompt** — tekan *Jana prompt* → prompt penuh siap copy, atau terus buka Claude/ChatGPT
   dengan prompt dah terisi. Ada juga *mod auto* kalau kau dah isi API key (lihat bawah).
3. **Tab 3 · Hasil & Jadual** — tampal balik output LLM → *Pecah jadi post* → setiap variasi jadi satu
   baris dalam barisan jadual. *Susun slot masa* isi tarikh/masa automatik (contoh: satu post tiap 24 jam,
   8 malam). Edit caption ikut suka.
4. **Eksport** — `Download CSV` untuk import ke Metricool Calendar, atau `Download JSON` untuk
   `scripts/metricool_push.py`.

Skrip rakaman (hook / body / CTA / cadangan b-roll) disimpan di bawah setiap baris — buka
*skrip rakaman* bila nak rakam.

## Import CSV ke Metricool

Metricool: **Calendar → ⋯ (kanan atas) → Import CSV**. Turunkan *template* dari situ dulu, tampal
**baris header sebenar** fail tu ke dalam kotak "Baris header CSV Metricool kau" dalam tab 3 —
eksport akan padan ikut nama kolum (template Metricool berubah dari semasa ke semasa, jadi jangan
percaya susunan default membuta). Default yang aku guna:

```
Text, Date, Time, Facebook, Twitter, LinkedIn, GMB, Instagram, TikTok, Threads,
Pinterest, Youtube, Bluesky, Type of Post, Brand Name, Picture Url 1..10
```

Kolum rangkaian diisi `TRUE`/`FALSE` ikut platform setiap post. Gambar/video **tak** boleh naik
melalui CSV kecuali kau ada URL awam — biasanya lebih senang tambah media dalam Metricool lepas import.

## Metricool API (optional)

```bash
export METRICOOL_USER_TOKEN=...   # header X-Mc-Auth
export METRICOOL_USER_ID=...
export METRICOOL_BLOG_ID=...      # id brand

python3 scripts/metricool_push.py --brands                    # cari blogId
python3 scripts/metricool_push.py skripgun-queue.json         # dry-run (default)
python3 scripts/metricool_push.py skripgun-queue.json --send  # betul-betul jadual
python3 scripts/metricool_push.py skripgun-queue.json --send --draft   # masuk sebagai draf
```

Stdlib Python sahaja, tiada dependency. Nota jujur: akses API Metricool hanya ada pada plan berbayar
tertentu, dan dokumentasi rasmi tak dapat dibaca masa skrip ni ditulis (proxy block domain dia), jadi
bentuk `POST /api/v2/scheduler/posts` di dalam ni ikut maklumat awam. Kalau dapat 4xx, banding dengan
`app.metricool.com/resources/apidocs` dan tukar `--path` atau `build_payload()`. Laluan CSV tak ada
masalah ni — itu sebab dia jadi default.

## Mod auto (API key)

Tab 4 · Setting. Dua bentuk API disokong:

| Pilihan | Base URL | Contoh model |
|---|---|---|
| OpenAI-compatible | `https://openrouter.ai/api/v1` | `nousresearch/hermes-4-405b` |
| OpenAI-compatible | `http://localhost:11434/v1` (Ollama) | `llama3.1:8b`, `hermes3` |
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-5` |

Key disimpan dalam `localStorage` browser kau sahaja. Dua amaran:

- **Jangan host fail ni secara public dengan key di dalam.** Ini tool peribadi.
- Sebahagian penyedia block panggilan terus dari browser (CORS). Kalau gagal, guna prompt manual
  (jalan 100%) atau letak proxy kecil kau sendiri di depan.

Tanpa key pun tool ni berfungsi penuh — memang direka sebagai *prompt builder* dulu.

## Apa yang prompt tu paksa LLM buat

- Struktur tetap per post (`HOOK / SCRIPT / CTA / CAPTION / HASHTAG / BROLL`) dalam blok
  `=== POST === … === END ===` supaya boleh di-parse automatik.
- Kiraan patah perkataan ikut panjang video (15s ≈ 40 patah, 30s ≈ 75, 45s ≈ 115, 60s ≈ 150).
- 10 formula hook Malaysia (review jujur, PAS, before-after, harga shock, pecah mitos, POV,
  listicle, storytelling, lawan keberatan, demo pantas) — setiap satu dengan struktur + contoh bunyi.
- Peraturan keras: jangan reka fakta/spesifikasi (guna placeholder `[...]`), tiada claim
  perubatan atau janji pendapatan, tiada superlatif tak boleh dibukti, wajib dedah link affiliate,
  hook tak boleh mula dengan "hai semua".

## Batasan yang kau patut tahu

- **Link pendek** (`s.shopee.com.my`, `vt.tiktok.com`, `invol.co`) tak boleh dibuka dari browser —
  nama produk kena isi manual. Link penuh produk baru boleh auto.
- Harga, spesifikasi dan stok **tidak** ditarik dari marketplace (tiada backend, CORS block). Isi
  sendiri dalam brief — dan itu sebenarnya bagus, sebab skrip jadi tepat bukan reka-reka.
- Muat naik video ke TikTok/IG tetap melalui Metricool (atau manual), bukan dari sini.

## Susunan fail

```
index.html                  tool penuh (UI + prompt builder + parser + eksport)
scripts/metricool_push.py   penghantar API optional, stdlib sahaja, dry-run by default
```
