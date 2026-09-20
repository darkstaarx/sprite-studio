import { test } from "node:test";
import assert from "node:assert/strict";
import { lintPost, arahanBetulkan } from "../lib/post-lint.mjs";

const kod = p => lintPost(p, { panjang: "sederhana" }).map(i => i.kod);

test("tangkap formula yang bunyi AI", () => {
  assert.ok(kod({ caption: "Dulu aku beli yang mahal. Sekarang aku beli yang ni sebab ia jalan dengan baik sekali untuk kerja harian aku." }).includes("formula-ai"));
  assert.ok(kod({ caption: "Bukan sebab ia cantik. Sebab ia tahan lama dan aku dah guna setiap hari sejak bulan lepas tanpa masalah." }).includes("formula-ai"));
  assert.ok(kod({ caption: "Benda ni ringan dan padu. Itu je bezanya dengan yang lama, tapi beza tu besar bila kau guna tiap hari macam aku." }).includes("formula-ai"));
});

test("tangkap kebocoran harga dan perkataan yang mengunci jangkaan", () => {
  const k = kod({ caption: "Aku beli benda ni RM12.90 je, memang murah untuk kualiti macam ni, dan aku dah guna hampir tiap hari sejak bulan lepas." });
  assert.ok(k.includes("harga-bocor"));
  assert.ok(k.includes("harga-kabur"));
  assert.deepEqual(lintPost({ caption: "Aku beli benda ni RM12.90 dan aku guna tiap hari sejak bulan lepas, sampai anak aku pun nak satu." },
    { sebutHarga: true, panjang: "sederhana" }).map(i => i.kod).filter(x => x.startsWith("harga")), [], "dibenarkan bila brief minta");
});

test("tangkap salam, emoji dalam hook, hashtag berlebihan, dan link dalam post", () => {
  assert.ok(kod({ caption: "Hai semua, hari ni aku nak kongsi sesuatu yang aku guna hampir tiap hari sejak bulan lepas dan ia ubah rutin aku." }).includes("salam"));
  assert.ok(kod({ caption: "🔥 Benda ni padu betul, aku dah guna tiap hari sejak bulan lepas dan sekarang aku tak boleh kerja tanpa dia." }).includes("emoji-hook"));
  assert.ok(kod({ caption: "Aku guna benda ni tiap hari sejak bulan lepas dan sekarang aku tak boleh kerja tanpa dia. #satu #dua #tiga" }).includes("hashtag"));
  assert.ok(kod({ caption: "Aku guna benda ni tiap hari sejak bulan lepas, link dia https://s.shopee.com.my/abc kalau nak tengok sendiri ya." }).includes("link-dalam-post"));
});

test("hormat julat panjang mengikut brief", () => {
  const pendek = "Satu ayat sahaja.";
  assert.ok(lintPost({ caption: pendek }, { panjang: "panjang" }).some(i => i.kod === "terlalu-pendek"));
  assert.ok(lintPost({ caption: pendek }, { panjang: "pendek" }).some(i => i.kod === "terlalu-pendek"));
  const ok = "A".repeat(250);
  assert.deepEqual(lintPost({ caption: ok }, { panjang: "sederhana" }).map(i => i.kod), []);
});

test("post bersih lulus tanpa aduan", () => {
  const bagus = `Anak aku sorok benda ni dalam beg sekolah. Cikgu jumpa masa kelas Sains.

Sekarang satu kelas dah ada. Cikgu pun ada satu atas meja dia.

Aku tak pasti aku patut bangga atau minta maaf, tapi aku dah beli dua lagi minggu ni.`;
  assert.deepEqual(lintPost({ caption: bagus }, { panjang: "sederhana" }), []);
});

test("arahan pembetulan senaraikan post dan masalahnya", () => {
  const arahan = arahanBetulkan([
    { index: 0, isu: [{ kod: "salam", pesan: "Baris pertama mula dengan sapaan." }] },
    { index: 1, isu: [] },
    { index: 2, isu: [{ kod: "harga-bocor", pesan: "Harga disebut." }] },
  ]);
  assert.match(arahan, /Post 1: Baris pertama/);
  assert.match(arahan, /Post 3: Harga disebut/);
  assert.ok(!/Post 2/.test(arahan), "post yang lulus tak disenaraikan");
  assert.equal(arahanBetulkan([{ index: 0, isu: [] }]), "");
});

test("tangkap nada kesian dan ayat jualan keras", () => {
  const k = t => lintPost({ caption: t }, { panjang: "sederhana" }).map(i => i.kod);
  assert.ok(k("Yang buat aku rasa bodoh ialah aku tak beli awal-awal lagi, sedangkan benda ni memang senang guna setiap hari.").includes("nada-kesian"));
  assert.ok(k("Aku hampir menangis bila tengok bil bulan tu, sebab semua barang naik harga dan gaji tak naik pun sejak tahun lepas.").includes("nada-kesian"));
  assert.ok(k("Aku guna benda ni tiap hari sejak bulan lepas. Kadang benda kecil yang paling bermakna dalam hidup kita ni, betul tak?").includes("nada-kesian"));
  assert.ok(k("Aku guna benda ni tiap hari dan memang best. Jangan lepaskan peluang, stok terhad sahaja untuk minggu ni je weh.").includes("jualan-keras"));
});

test("nada rilek dengan slang lulus tanpa aduan", () => {
  const rilek = `Benda ni sepatutnya wujud sepuluh tahun lepas. Kepala aku dah botak sebelah baru jumpa.

Picit dua tiga kali, terus rasa nak sambung kerja balik.

Korang usya la dulu sebelum stress tu jadi darah tinggi.`;
  assert.deepEqual(lintPost({ caption: rilek }, { panjang: "sederhana" }), []);
});

test("post lawak gaya mesin ditangkap: pepatah, jenaka diterangkan, tiada watak", () => {
  const mentega = [
    "Kalau mentega atas meja kau tak cair, jangan terus cari roti.",
    "",
    "Itu squishy bentuk butter. Rupanya cukup meyakinkan untuk buat orang berhenti dua saat, "
      + "lepas tu kau boleh picit, tarik dan gelek bila tangan sibuk nak kacau benda.",
    "",
    "Cuma tolong jauhkan dari toaster. Link dalam balasan pertama.",
  ].join("\n");
  const kod = lintPost({ caption: mentega, angle: "lawak" }, { panjang: "sederhana" }).map(i => i.kod);
  for (const perlu of ["pepatah", "terang-jenaka", "tiada-aku", "ayat-iklan", "senarai-tiga", "ayat-app"]) {
    assert.ok(kod.includes(perlu), `patut tangkap ${perlu} — dapat ${kod.join(", ")}`);
  }
});

test("babak sebenar dengan watak lulus tanpa aduan gaya", () => {
  const elok = [
    "Mak aku angkat benda ni nak masuk peti ais. Aku biar je dia jalan sampai dapur.",
    "",
    "Sekarang dia dah tau ia mainan, tapi tiap kali lalu meja tu dia picit sekali. Memang tak boleh tahan.",
  ].join("\n");
  const kod = lintPost({ caption: elok, angle: "lawak" }, { panjang: "sederhana" }).map(i => i.kod);
  for (const jangan of ["pepatah", "terang-jenaka", "tiada-aku", "ayat-iklan", "senarai-tiga", "ayat-app"]) {
    assert.ok(!kod.includes(jangan), `tak patut adu ${jangan} — dapat ${kod.join(", ")}`);
  }
});

test("Manglish yang orang betul-betul taip lulus tanpa aduan", () => {
  // Dua contoh ni datang terus daripada pengguna — inilah nada sasaran.
  const contoh = [
    "mak aku boleh g angkat benda ni masuk peti oi! patut lah aku cari tak jumpa jumpa, "
      + "beli untuk hilang stress, tiba tiba jadi stress balik!",
    "anak buah aku datang rumah, dia plak seronok melayan. bapak dia dah bebel dekat aku kenapa "
      + "aku tak simpan elok elok, tak pasal pasal anak dia suruh dia beli, haa padan muka, hahaha!",
  ];
  for (const teks of contoh) {
    assert.deepEqual(lintPost({ caption: teks, angle: "lawak" }, { panjang: "pendek" }), [],
      `patut lulus bersih: ${teks.slice(0, 40)}…`);
  }
});

test("bahasa baku dan sengkang panjang ditangkap", () => {
  const baku = "Produk ini adalah sangat berguna kerana ia menjimatkan masa anda — tetapi aku suka.";
  const kod = lintPost({ caption: baku, angle: "review" }, { panjang: "pendek" }).map(i => i.kod);
  assert.ok(kod.includes("bahasa-baku"), "patut tangkap perkataan baku");
  assert.ok(kod.includes("sengkang"), "patut tangkap sengkang panjang");
});
