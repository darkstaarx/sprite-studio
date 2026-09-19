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

## Sambung Threads (tanpa server HTTPS)

Meta hanya terima redirect URI berbentuk `https://`, **dan Threads menolak `localhost` sepenuhnya**
walaupun dengan https. Jadi tiada cara untuk Meta memanggil balik server tempatan kau.
ViralCool mengelak masalah itu: biarkan Meta redirect ke alamat https yang tak wujud, kemudian
salin URL dari bar alamat dan tampal balik ke dalam app. Kod kebenaran ada di dalam URL itu.

Tekan **Sambung Threads** di muka depan, lepas tu ikut tiga langkah:

**A. Buat app di Meta (sekali sahaja)** — [developers.facebook.com/apps](https://developers.facebook.com/apps)
→ Create app → use case **"Access the Threads API"**. Dalam app itu:
kebenaran `threads_basic` dan `threads_content_publish`; dalam dashboard Meta pergi
**App roles → Roles → Add People → Threads Tester** dan taip username Threads kau tanpa `@`;
kemudian dalam **app Threads**: ☰ → **Settings** → **More settings** → **Website permissions**
→ tab **Invites** → **Accept**. Akaun Threads mesti **public**, akaun private tak boleh terima
jemputan. Akhir sekali, dalam use case Threads → Settings, tampal redirect URI yang ViralCool tunjukkan
(default `https://viralcool.invalid/callback` — domain yang memang tak wujud, dan itu memang
tujuannya) ke dalam **Redirect Callback URLs**. Tiga perangkap di medan ini:

1. Selepas menaip, satu cadangan muncul di bawah medan — **kau mesti klik cadangan itu**, kalau
   tidak nilainya nampak masuk tetapi tidak tersimpan.
2. Ketiga-tiga medan pada halaman itu — **Redirect Callback URLs**, **Uninstall Callback URL** dan
   **Delete Callback URL** — mesti diisi dengan alamat yang sama sebelum butang **Save** berfungsi.
   Dua yang terakhir wajib walaupun tidak digunakan. Muat semula halaman selepas save untuk
   mengesahkan nilainya kekal.
3. `localhost` dan `127.0.0.1` akan ditolak dengan ralat "URL Blocked" (kod 1349168).

Kemudian isi App ID dan App Secret dalam ViralCool.

**B. Bagi kebenaran** — tekan pautan yang muncul, log masuk, approve. Browser akan cuba buka
halaman yang tak wujud. Itu memang dijangka.

**C. Salin URL** — salin keseluruhan URL dari bar alamat (ada `?code=…`) dan tampal dalam ViralCool.
App tukar kod itu kepada token 60 hari, baca nama akaun kau, dan simpan.

App Secret disimpan dalam `data/db.json` pada mesin kau dan tidak pernah dihantar balik ke UI.

## Muka depan — empat langkah

`http://localhost:8787/` ialah satu muka sahaja:

**Mod "Ada produk"**
1. Tampal link produk
2. Pilih gaya tulisan (cerita sebenar, review jujur, pecah mitos, senarai, soalan, kiraan harga)
3. Pilih waktu — 7 pagi, 1 tengah hari, 7 malam (boleh tambah 9 malam), tarikh mula, berapa post
4. Tulis & jadualkan → semak → sahkan

**Mod "Ada masalah"**
1. Taip masalah, contoh "anak sekolah"
2. Sistem cadangkan sehingga 5 produk dari pustaka kau yang boleh tolong, dengan sebab
3. Pilih mana yang kau nak pakai
4. Gaya dan waktu sama seperti di atas

Pustaka produk: tampal link sekali, sistem kesan nama/harga/gambar dan ingat. Padanan masalah guna
LLM bila dikonfigur, dan padanan kata kunci bila tidak.

**Had yang perlu kau tahu:** carian produk hanya meliputi pustaka kau sendiri. Shopee tak benarkan
carian katalog tanpa API affiliate, jadi sehingga kredential itu dipasang, sistem tak boleh cari
produk yang kau sendiri belum simpan.

Studio enam tab yang lama masih ada di `/studio.html` untuk kerja terperinci (akaun, autopilot,
otak, log).

## Aliran affiliate — satu tampal

Ini teras app ni. Tab **Tulis**, kotak paling atas:

```
tampal link produk  →  [Kesan & jana]
```

Apa yang berlaku dalam satu tekan:

1. **Buka link pendek.** `s.shopee.com.my/…`, `vt.tiktok.com/…`, `invol.co/…` — semua diikut
   sampai ke halaman produk sebenar. Link asal kau (dengan kod affiliate) **tak disentuh** dan
   dipakai semula dalam balasan pertama setiap post.
2. **Kesan produk.** Nama, harga, gambar dan keterangan diambil dari JSON-LD halaman produk,
   atau dari tag Open Graph (tag yang sama yang buat link kau ada thumbnail dalam WhatsApp),
   atau paling akhir dari slug URL. Marketplace kerap tolak "browser" tetapi tetap hidangkan
   tag pratonton kepada pembaca pautan, jadi app cuba ejen pratonton dahulu sebelum browser biasa,
   dan berhenti sebaik metadata dijumpai.
3. **Tulis ayat.** Butiran yang dikesan masuk terus ke dalam brief, digabung dengan base prompt
   dan playbook Threads, dan dihantar ke LLM kau.
4. **Jadualkan.** Setiap post dapat slot waktu puncak Malaysia dan duduk dalam barisan sebagai
   `review` sampai kau approve.

Butang **Uji link sahaja** di sebelahnya cuma mengesan tanpa jana apa-apa, dan membuka laporan
teknikal (rantaian redirect, status HTTP, tag yang dijumpai, petikan halaman) dengan butang
**Copy laporan** — berguna bila sesuatu marketplace block bacaan dan kau nak tunjuk buktinya.

Dua perkara yang app buat supaya ayat tak jadi reka-reka:

- Keterangan yang cuma ayat sambutan kedai ("Welcome to the Official … Store") dibuang, bukan
  disuap sebagai fakta produk.
- Bila harga tak dikesan, angle kiraan harga digugurkan automatik — kalau tidak model terpaksa
  mereka nombor. Isi harga dalam brief untuk dapatkan angle tu semula.

Setiap pengesanan datang dengan tahap keyakinan:

| Keyakinan | Maksud |
|---|---|
| tinggi | dibaca dari JSON-LD halaman produk |
| sederhana | dibaca dari tag Open Graph |
| rendah | nama diteka dari URL sahaja — sahkan sendiri |
| tiada | langsung tak dapat; isi nama dan harga manual |

Kalau marketplace block bacaan automatik (captcha atau 403), app tak mengarut — ia bagitahu,
dan minta kau isi nama dengan harga sahaja, lepas tu teruskan aliran yang sama.

Endpoint yang sama ada untuk guna sendiri:

```bash
curl -X POST localhost:8787/api/quick -H 'content-type: application/json' \
  -d '{"url":"https://s.shopee.com.my/ABC123","count":5}'
```

`POST /api/detect` pula cuma kesan produk tanpa jana apa-apa.

## Paling mudah sekali — ViralCool Lite (tiada pemasangan)

Satu fail: **`viralcool-lite.html`**. Klik dua kali, ia terbuka dalam browser kau. Tiada Node,
tiada pemasangan, tiada kotak hitam, tak perlu internet pun.

Apa dia buat: brief produk → arahan penuh untuk AI (base prompt + playbook Threads, ~12,600 aksara)
→ tampal balik jawapan AI → barisan post dengan slot masa, butang copy, dan penanda "dah post".
Boleh juga jana rangka post tanpa AI langsung.

Apa dia **tak** buat: tiada auto-post. Kau copy dan post sendiri. Untuk auto-post, guna versi penuh
di bawah.

Fail ni dibina dari `prompts/` — kalau kau edit playbook, jalankan `node lite/build.mjs` untuk
bina semula.

## Versi penuh — kalau kau nak auto-post

Tiga langkah, satu kali setup, tiada terminal:

1. **Pasang Node sekali sahaja.** Pergi [nodejs.org](https://nodejs.org), muat turun versi **LTS**,
   buka fail yang dimuat turun, tekan Next sampai habis. Ini enjin yang jalankan ViralCool.
2. **Muat turun ViralCool.** Di halaman repo GitHub, tekan butang hijau **Code** →
   **Download ZIP**. Unzip. Letak folder tu di mana kau senang jumpa (contoh: Desktop).
3. **Klik dua kali fail `mula`:**
   - Mac: `mula.command` — kali pertama sahaja, **klik kanan → Open → Open** (macOS tanya sekali
     sebab fail ni bukan dari App Store).
   - Windows: `mula.bat`.

   Satu tetingkap hitam terbuka dan browser kau terbuka sendiri di `http://localhost:8787`.
   **Jangan tutup tetingkap hitam tu** selagi kau guna ViralCool — itu "enjin" dia.
   Nak berhenti: tutup tetingkap tu.

Guna balik esok? Klik dua kali `mula` sekali lagi. Itu sahaja.

### Mod paling selamat untuk mula

Biar Autopilot **mati** dan jangan sambung akaun dulu:

1. Tab **Tulis** → isi brief produk → **Jana ayat**.
2. Copy caption, buka app Threads/TikTok sendiri, post macam biasa.

Dalam mod ni ViralCool cuma penulis ayat + tempat simpan barisan. Tiada apa-apa yang menyentuh
akaun kau, jadi tiada langsung risiko akaun. Bila kau dah selesa, baru sambung satu akaun dan
biar dia hantar sendiri.

## Elak kena ban

Yang penting difahami: **ViralCool guna API rasmi Meta dan TikTok** — cara yang platform sendiri
sediakan untuk posting berjadual, sama macam Metricool, Buffer atau Later. Menjadual post melalui
API rasmi bukan sebab orang kena ban.

Yang buat akaun kena ban atau dihukum jangkauan:

| Jangan | Sebab |
|---|---|
| Tools yang minta username + password akaun kau | Itu login palsu/bot, melanggar terma. ViralCool tak pernah minta password — hanya token rasmi. |
| Banyak post sehari | Kekal 1–3 post sehari per akaun. Playbook Threads memang tetapkan begitu. |
| Teks sama diulang atau disalin ke banyak akaun | Platform kesan kandungan pendua. Setiap variasi kena lain betul-betul. |
| Link affiliate tanpa pendedahan | Risiko dari platform dan juga pihak berkuasa pengguna. Guna `#ad` atau "link affiliate". |
| Engagement bait dan timbunan hashtag | "Like kalau setuju", 20 hashtag — kedua-duanya isyarat spam. |
| Auto-reply komen | Balas komen sendiri. Itu juga yang naikkan jangkauan kau. |

Cadangan aku untuk minggu pertama: `autoPublish` mati (kau approve setiap post), satu akaun sahaja,
dua post sehari. Kalau kau nak cuba tanpa apa-apa keluar langsung, jalankan dalam mod dry — tukar
baris `node server.mjs` dalam fail `mula` kepada `node server.mjs --dry`.

Untuk TikTok, tetapan default memang hantar ke **draf** dalam app TikTok, bukan terus terbit —
kau tekan post sendiri. Itu pilihan paling selamat dan ia default atas sebab tu.

## Mula (kalau kau selesa dengan terminal)

```bash
node server.mjs          # buka http://localhost:8787
node server.mjs --dry    # mod selamat: semua "terbit" jadi pura-pura
npm test                 # 41 ujian
```

## Cara akses

Kod ni duduk dalam repo — tiada server awam, tiada langganan. Kau yang hidupkan.

```bash
git clone https://github.com/darkstaarx/sprite-studio.git
cd sprite-studio
git checkout claude/viral-kaya-minimalist-nwaw71
node server.mjs            # buka http://localhost:8787
```

Perlu Node 20 ke atas (`node -v` untuk semak; kalau tiada, pasang dari nodejs.org atau `brew install node`).
Tiada `npm install` — memang tiada dependency.

**Dari telefon, wifi yang sama:**

```bash
HOST=0.0.0.0 VIRALCOOL_TOKEN=kunci-panjang-kau node server.mjs
```

Cari IP mesin kau (`ipconfig getifaddr en0` di Mac, `hostname -I` di Linux, `ipconfig` di Windows),
lepas tu buka `http://192.168.x.x:8787` di telefon. Kali pertama ia tanya kunci — tampal nilai
`VIRALCOOL_TOKEN` tadi, ia diingat dalam browser telefon. Butang kunci di atas kanan untuk tukar.
Jangan buka port ni ke internet tanpa token.

**Nak ia jalan 24/7:** scheduler dan autopilot hanya hidup selagi proses ni hidup. Laptop tidur =
tiada post keluar. Pilih satu mesin yang memang sentiasa hidup:

| Pilihan | Nota |
|---|---|
| Raspberry Pi / mini PC di rumah | paling murah jangka panjang, kau pegang semua data |
| VPS kecil (Hetzner, DigitalOcean, Contabo) | ~RM10-25 sebulan, 1GB RAM dah lebih dari cukup |
| Mesin kerja yang tak pernah tidur | cukup untuk mula |

Jadikan servis supaya ia hidup balik selepas reboot — contoh systemd:

```ini
# /etc/systemd/system/viralcool.service
[Service]
WorkingDirectory=/home/kau/sprite-studio
ExecStart=/usr/bin/node server.mjs
Environment=TZ=Asia/Kuala_Lumpur
Restart=always
User=kau
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now viralcool
```

`TZ=Asia/Kuala_Lumpur` penting: slot autopilot (`12:30`, `21:00`) dikira ikut jam mesin.

**Akses dari luar rumah, dan untuk OAuth:** Meta perlu URL awam untuk redirect callback. Guna
Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:8787`) atau Tailscale, lepas tu set
`PUBLIC_URL` dalam `.env` ke URL tu. Kalau kau guna token manual dalam tab Akaun, kau tak perlu ni langsung.

**Kenapa bukan Vercel/Netlify:** kedua-duanya serverless — proses tak kekal hidup, jadi loop 30 saat
dan autopilot takkan jalan. Kalau kau memang nak guna, kau kena tambah endpoint `tick` dan panggil
ia dari cron luar; belum ada dalam repo ni.

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
| `openai` | `https://openrouter.ai/api/v1` | `nousresearch/hermes-4-405b` atau `nousresearch/hermes-4-70b` |
| `openai` | `http://localhost:11434/v1` | `hermes3`, `llama3.1:8b` |
| `anthropic` | `https://api.anthropic.com` | `claude-sonnet-5` |

Muka depan ada kad **Enjin ayat** dengan preset Hermes 4 405B, Hermes 4 70B, OpenRouter, Anthropic
dan Ollama — pilih satu, tampal key, simpan. Model penaakulan yang mengeluarkan jejak `<think>`
(Hermes 4 antaranya) dikendalikan: jejak itu dibuang sebelum JSON dibaca.

Panggilan dibuat dari **server**, bukan browser — jadi tiada masalah CORS, dan key tak pernah
dihantar ke UI (state API balas `__SET__` sahaja).

## Struktur

```
viralcool-lite.html     versi tanpa pemasangan (dibina dari lite/build.mjs)
lite/                   templat + skrip bina untuk fail Lite
mula.command / mula.bat pelancar klik-dua-kali (Mac / Windows)
server.mjs              HTTP + API + static + boot enjin jadual
lib/store.mjs           simpanan JSON atomik (settings, accounts, briefs, posts, logs)
lib/detect.mjs          buka link pendek, kesan nama/harga/gambar dari halaman produk
lib/platforms.mjs       had aksara, keperluan media, gaya tulisan setiap platform
lib/llm.mjs             bina prompt, panggil LLM, parse JSON, penjana templat 'local'
lib/publishers.mjs      adapter Threads / Facebook / Instagram / TikTok / manual + verify token
lib/scheduler.mjs       slot masa, autopilot, tick terbit + retry backoff
lib/oauth.mjs           OAuth Threads dan Meta melalui callback (perlu URL awam)
lib/threads-setup.mjs   sambung Threads dengan salin-tampal URL (tiada HTTPS diperlukan)
prompts/base-prompt.md  otak gaya penulisan (semua platform)
prompts/platforms/      playbook khusus platform — threads.md siap, tambah sendiri yang lain
public/index.html       muka depan empat langkah
public/studio.html      studio lanjutan (akaun, autopilot, otak, log)
test/                   41 ujian (unit + API hidup, mod dry)
```

## Batasan jujur

- **Pengesanan produk bergantung pada marketplace.** Shopee, Lazada dan TikTok Shop kerap block
  pembacaan automatik. Bila tag Open Graph ada (selalunya ada, sebab itu yang jadikan thumbnail
  dalam WhatsApp), pengesanan jalan. Bila diblock, app minta kau isi nama dan harga. Pengesanan
  diuji dengan kedai palsu tempatan; ia belum diuji terhadap Shopee sebenar kerana domain
  marketplace tak boleh dicapai dari persekitaran tempat kod ni ditulis.
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
