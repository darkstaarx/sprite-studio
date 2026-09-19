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
npm test                 # 16 ujian
```

## Tab dalam UI

| Tab | Guna |
|---|---|
| **Barisan** | Semua post: tunggu approve, berjadual, terbit, gagal. Edit teks, tukar masa, terbit sekarang, buang. |
| **Tulis** | Brief produk (link, harga, kelebihan, masalah, audience, angle) → jana → pilih → masuk barisan. |
| **Autopilot** | AI jana + jadual sendiri bila barisan menipis. Boleh auto-publish tanpa approve. Tetapan LLM juga di sini. |
| **Akaun** | Sambung Threads / Facebook / Instagram / TikTok — OAuth atau tampal token terus. |
| **Otak** | Editor `prompts/base-prompt.md` — cara AI menulis ayat. Simpan, terus berkesan. |
| **Log** | Apa yang enjin buat: terbit, gagal, autopilot, OAuth. |

## Otak: `prompts/base-prompt.md`

Fail ni yang mengajar AI menulis, dan ia fail biasa — edit dalam UI atau dalam editor kau.
Isinya: hukum ayat (satu ayat satu idea, irama panjang-pendek, buang pengisi, konkrit kalahkan
abstrak), hukum hook 3 saat, struktur post, larangan keras (tiada claim kesihatan, tiada superlatif
palsu, wajib dedah affiliate), profil suara kau, dan kontrak output JSON.

Bahagian **§7 Sumber gaya tambahan** memang dibiar kosong: tampal di situ peraturan atau contoh
tulisan yang kau nak AI ikut (contohnya post Threads yang kau rujuk). Satu peraturan satu baris di
bawah `PERATURAN:`, contoh post penuh di bawah `CONTOH:` — AI tiru iramanya, bukan salin ayatnya.

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
prompts/base-prompt.md  otak gaya penulisan
public/index.html       UI satu fail
test/                   16 ujian (unit + API hidup, mod dry)
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
