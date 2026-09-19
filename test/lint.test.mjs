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
