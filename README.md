# ViralCool

Penjana ayat viral **dan** penjadual/penerbit sendiri. Gabungan apa yang ViralKaya buat (tulis skrip)
dengan apa yang Metricool buat (jadual + terbit) — tapi jalan atas mesin kau, guna akaun kau,
tiada langganan dan tiada perantara.

```
brief produk ─► base prompt (otak gaya) ─► LLM ─► post + skrip rakaman
                                                     │
                                          approve ───┤ (atau autopilot: AI terus jadual)
                                                     ▼
                                    barisan berjadual ─► enjin jadual ─► Threads / FB / IG / TikTok
```

- **Tiada dependency.** Node 20+ sahaja. Tiada npm install.
- **Tiada API key pun boleh mula.** Provider default `local` menjana post dari templat; tukar ke
  OpenRouter/Hermes/Ollama/Anthropic bila kau dah ada key.
- **Data kau duduk di `data/db.json`.** Token pun. Tiada telemetri, tiada cloud.

## Mula

```bash
node server.mjs          # buka http://localhost:8787
node server.mjs --dry    # mod selamat: semua "terbit" jadi pura-pura
npm test                 # 21 ujian
```

## Tab dalam UI

| Tab | Guna |
|---|---|
| **Barisan** | Semua post: tunggu approve, berjadual, terbit, gagal. Edit teks, tukar masa, terbit sekarang, buang. |
| **Tulis** | Brief produk (link, harga, kelebihan, masalah, audience, angle) → jana → pilih → masuk barisan. |
| **Autopilot** | AI jana + jadual sendiri bila barisan menipis. Boleh auto-publish tanpa approve. Tetapan LLM juga di sini. |
| **Akaun** | Sambung Threads / Facebook / Instagram / TikTok — OAuth atau tampal token terus. |
| **Otak** | Editor base prompt + playbook setiap platform — cara AI menulis ayat. Simpan, terus berkesan. |
| **Log** | Apa yang enjin buat: terbit, gagal, autopilot, OAuth. |

## Otak: `prompts/`

Dua lapis, kedua-duanya fail markdown biasa — edit dalam UI (tab **Otak**) atau dalam editor kau.
Server baca setiap kali jana, jadi perubahan terus berkesan.

**`prompts/base-prompt.md`** — berlaku pada semua platform: hukum ayat (satu ayat satu idea, irama
panjang-pendek, ayat pertama maksimum 12 patah, buang pengisi, konkrit kalahkan abstrak), hukum hook
3 saat, struktur post, larangan keras (tiada claim kesihatan, tiada superlatif palsu, wajib dedah
affiliate), konteks pasaran Malaysia, dan kontrak output JSON. Ada ruang kosong untuk kau tampal
peraturan/contoh tulisan kau sendiri.

**`prompts/platforms/<platform>.md`** — playbook khusus, ditambah automatik bila platform tu dijana,
dan menang kalau bercanggah dengan base prompt. Yang siap sekarang: **Threads**.

### Apa dalam playbook Threads

Ditulis dari data platform + pasaran Malaysia, bukan agakan:

- **Threads kira balasan, bukan like.** 20 like + 15 balasan diedar lebih luas daripada 200 like
  tanpa balasan. Jadi setiap post ditulis untuk menjemput orang taip sesuatu.
- **Nisbah 4:1** — empat post bernilai untuk satu post menjual; akaun yang bunyi macam kedai dihukum.
- **Visual wajib dicadangkan** sebab post bergambar dapat engagement jauh lebih tinggi daripada teks kosong.
- **Had 500 aksara**, sasar 120–320. Baris pertama = preview dalam feed, kena berdiri sendiri.
  Hashtag 0–1 sahaja.
- **Link duduk dalam balasan pertama**, bukan dalam post — Threads tak hukum link secara algoritma,
  tapi pembaca berhenti bila nampak link. Setiap post Threads datang dengan medan `reply` siap ayat.
- **7 bentuk post** yang memang jalan di Threads: hot take, "aku silap", kiraan harga, babak pendek,
  soalan jujur, senarai pendek, thread bersiri bernombor.
- **Suara Malaysia:** BM santai + code-switch English yang orang memang guna; bahasa Indonesia haram;
  aku/kau/korang; harga dalam RM dengan kiraan per hari; rujukan tempatan hanya bila ia benar.
  Elak kaum/agama/politik sebagai bahan lawak.
- **Realiti affiliate MY:** komisen Shopee kecil dan bertutup per pesanan, TikTok Shop lebih lumayan
  tapi jualan berlaku dalam app TikTok. Maka Threads = bina kepercayaan, bukan tempat hard-sell.
- **Waktu Malaysia:** 9–11 malam paling kuat, 12:30–2 petang kedua, 7–9 pagi ketiga; Ramadan
  berubah ke sebelum buka, selepas 10 malam, dan sahur 4–5.30 pagi. Slot autopilot default
  (`12:30`, `21:00`) ikut data ni.

Nak tambah platform lain? Buat `prompts/platforms/tiktok.md` — ia terus dikesan dan muncul
dalam tab Otak, tiada kod perlu diubah.

## Autopilot — "AI act sendiri"

Tetapkan slot (`12:30, 20:00`), berapa post nak simpan dalam barisan (`minQueue`), dan berapa nak
jana setiap kali (`batch`). Setiap 30 saat enjin semak:

1. Ada post yang dah sampai masa? Terbitkan. Gagal → cuba semula 3 kali (2 min, 10 min, 30 min)
   sebelum ditanda `failed`.
2. Barisan bawah `minQueue`? Jana batch baru dari brief yang paling lama tak diguna, letak dalam
   slot kosong seterusnya.

`autoPublish: false` (default) bermaksud AI jana dan jadual, tapi post duduk dalam status
`review` sampai kau tekan approve. Hidupkan `true` kalau kau nak dia jalan tanpa kau.

## Sambung akaun

**Cara pantas (peribadi):** tab Akaun → *Tambah token manual*. Tampal access token + id:

| Platform | Yang perlu | Nota |
|---|---|---|
| Threads | token + Threads user id | Post teks terus. Gambar/video perlu URL awam. |
| Facebook Page | **Page** access token + Page id | Guna `/feed`, atau `/photos` kalau ada gambar. |
| Instagram | Page token + IG business user id | Wajib ada media URL awam. Video → REELS. |
| TikTok | token OAuth TikTok | Default hantar ke **inbox/draf** (tak perlu app diaudit). Direct post perlu audit. |
| Manual | — | Tiada API: post ditanda siap dan webhook kau di-ping supaya kau post sendiri. |

**Cara penuh (OAuth):** isi `THREADS_APP_ID/SECRET` atau `META_APP_ID/SECRET` dalam `.env`, set
`PUBLIC_URL` ke URL yang boleh dicapai Meta (ngrok/cloudflared kalau di laptop), lepas tu tekan
butang Sambung dalam tab Akaun. Token Threads ditukar jadi long-lived (~60 hari) automatik.

## Enjin LLM

| Provider | Base URL | Model contoh |
|---|---|---|
| `local` | — | tiada; templat dalam `lib/llm.mjs` |
| `openai` | `https://openrouter.ai/api/v1` | `nousresearch/hermes-4-405b` |
| `openai` | `http://localhost:11434/v1` | `hermes3`, `llama3.1:8b` |
| `anthropic` | `https://api.anthropic.com` | `claude-sonnet-5` |

Panggilan dibuat dari **server**, bukan browser — jadi tiada masalah CORS, dan key tak pernah
dihantar ke UI (state API balas `__SET__` sahaja).

## Struktur

```
server.mjs              HTTP + API + static + boot enjin jadual
lib/store.mjs           simpanan JSON atomik (settings, accounts, briefs, posts, logs)
lib/platforms.mjs       had aksara, keperluan media, gaya tulisan setiap platform
lib/llm.mjs             bina prompt, panggil LLM, parse JSON, penjana templat 'local'
lib/publishers.mjs      adapter Threads / Facebook / Instagram / TikTok / manual + verify token
lib/scheduler.mjs       slot masa, autopilot, tick terbit + retry backoff
lib/oauth.mjs           OAuth Threads dan Meta (optional)
prompts/base-prompt.md  otak gaya penulisan (semua platform)
prompts/platforms/      playbook khusus platform — threads.md siap, tambah sendiri yang lain
public/index.html       UI satu fail
test/                   21 ujian (unit + API hidup, mod dry)
```

## Batasan jujur

- **Video/gambar kena ada URL awam.** IG dan TikTok tarik media melalui URL (`PULL_FROM_URL`),
  jadi tiada upload fail dari komputer buat masa ni. Letak dalam R2/S3/Drive awam dulu.
- **TikTok direct post perlu app diaudit.** Tanpa audit, video masuk inbox/draf dan kau tekan
  post dalam app TikTok.
- **Bentuk API Meta/TikTok ditulis ikut dokumentasi rasmi**, tapi domain mereka tak dapat dicapai
  dari persekitaran tempat kod ni ditulis — jadi adapter belum diuji dengan token hidup. Jalankan
  `node server.mjs --dry` dan butang *Semak token* dalam tab Akaun sebelum kau percaya sepenuhnya;
  versi Graph boleh ditukar dengan `META_GRAPH_VERSION`.
- **Instagram perlu akaun Business/Creator** yang bersambung ke Facebook Page. Akaun peribadi tak
  boleh guna Content Publishing API.

## Rujukan playbook Threads

- [Threads algorithm 2026 — Metricool](https://metricool.com/threads-algorithm/) dan
  [Threads strategy, 10k+ post dianalisis — Teract](https://www.teract.ai/resources/threads-content-strategy-2026):
  balasan sebagai isyarat utama, kesan visual, kekerapan post.
- [Threads marketing guide — Metricool](https://metricool.com/threads-marketing-guide/) dan
  [Outfy](https://www.outfy.com/blog/threads-marketing/): bentuk hook, format thread bersiri, nada perbualan.
- [Social Media Today — pendirian setiap platform tentang link luar](https://www.socialmediatoday.com/news/heres-each-big-social-platform-stand-external-links/733946/):
  Mosseri kata tiada penalti algoritma untuk link di Threads.
- [Statistik media sosial Malaysia 2026 — Zenweb](https://zenweb.my/blog/social-media-statistics-malaysia/) dan
  [TikTok Shop Malaysia 2026 — SushiVid](https://blog.sushivid.com/tiktok-shop-malaysia-2026-numbers-every-brand-should-know):
  jangkauan platform, kelakuan membeli, kadar komisen affiliate.
- [Waktu terbaik post di Malaysia — BrandKraf](https://www.brandkraf.com/blog/best-time-to-post-social-media-malaysia)
  dan [Zenweb](https://zenweb.my/blog/best-time-to-post-malaysia/): tetingkap malam, tengah hari, dan anjakan Ramadan.
- [Copywriting untuk audience Malaysia — iPrima](https://www.iprimamedia.com/copywriting-malaysia/):
  emosi, cerita, bahasa mudah.
