const fs = require("fs");

const raw = JSON.parse(fs.readFileSync("scraping/raw.json", "utf-8"));

const text = (s) =>
  String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/,/g, ";")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toPrice = (v) => {
  const m = String(v ?? "").match(/\d[\d.]*/);
  let n = m ? Number(m[0].replace(/\./g, "")) : 0;
  if (n >= 100000000) n = Math.round(n / 100000);
  return n;
};

const seen = new Set();
const rows = [];
for (const it of raw) {
  const nama = text(it.nama ?? it.name).slice(0, 100);
  const harga = toPrice(it.harga ?? it.price);
  if (!nama || !harga || seen.has(nama.toLowerCase())) continue;
  seen.add(nama.toLowerCase());
  rows.push([
    nama,
    text(it.kategori ?? it.category ?? "Umum"),
    harga,
    (text(it.deskripsi ?? it.description) || nama).slice(0, 250),
  ]);
}

const csv = ["nama,kategori,harga,deskripsi", ...rows.map((r) => r.join(","))].join("\n");
fs.writeFileSync("data/products.csv", csv, "utf-8");
console.log(`Selesai: ${rows.length} produk -> data/products.csv`);