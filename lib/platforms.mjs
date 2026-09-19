// Peraturan setiap platform: had teks, keperluan media, gaya penulisan untuk prompt.
export const PLATFORMS = {
  threads: {
    label: "Threads",
    limit: 500,
    media: "optional",
    publisher: "threads",
    style:
      "Post teks sahaja. Baris pertama kena hentikan scroll. Maksimum 500 aksara. " +
      "Hashtag 0-1 sahaja. Bunyi macam orang bersuara sendiri, bukan iklan. Perenggan pendek, ada ruang bernafas.",
  },
  facebook: {
    label: "Facebook Page",
    limit: 5000,
    media: "optional",
    publisher: "facebook",
    style:
      "Boleh lebih panjang (100-180 patah). Bercerita, perenggan 1-2 ayat. " +
      "Ayat pertama kena berdiri sendiri sebab FB potong teks. CTA jelas di hujung. Hashtag 0-3.",
  },
  instagram: {
    label: "Instagram",
    limit: 2200,
    media: "required",
    publisher: "instagram",
    style:
      "Caption untuk Reel/gambar. Baris pertama = hook. Guna line break. 5-8 hashtag campur besar dan kecil di hujung. " +
      "Sertakan skrip voiceover berasingan untuk rakaman.",
  },
  tiktok: {
    label: "TikTok",
    limit: 2200,
    media: "required",
    publisher: "tiktok",
    style:
      "Skrip voiceover video vertikal + caption pendek. Hook mesti dalam 3 saat pertama. " +
      "Ayat pendek, satu idea satu ayat. Cadangkan 3 shot b-roll. Caption 1-2 baris + 3-5 hashtag.",
  },
  manual: {
    label: "Manual / salin sendiri",
    limit: 5000,
    media: "optional",
    publisher: "manual",
    style: "Teks generik yang kau salin sendiri ke mana-mana platform.",
  },
};

export const platformIds = () => Object.keys(PLATFORMS);
export const platform = id => PLATFORMS[id] || PLATFORMS.manual;
