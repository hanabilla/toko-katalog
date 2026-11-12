const fs = require("fs");
const path = require("path");

const CORE = ["nama", "kategori", "harga", "deskripsi"];
const STOPWORDS = new Set([
  "ada", "apa", "aja", "saja", "yang", "dan", "atau", "untuk", "dengan", "dari",
  "ini", "itu", "berapa", "harga", "harganya", "kak", "min", "mau", "tanya",
  "dong", "ya", "gak", "nggak", "tidak", "bisa", "produk", "jual", "beli"
]);

class RAGEngine {
  constructor(csvPath, options = {}) {
    this.csvPath = csvPath || path.join(__dirname, "../data/products.csv");
    this.topK = options.topK || Number(process.env.RAG_TOP_K || 8);
    this.products = [];
    this.categories = [];
    this.vocab = [];
    this.loadData();
  }

  loadData() {
    try {
      if (!fs.existsSync(this.csvPath)) {
        console.warn(`[RAG] File CSV tidak ditemukan di: ${this.csvPath}`);
        this.products = [];
        return;
      }
      const content = fs.readFileSync(this.csvPath, "utf-8").replace(/^\uFEFF/, "");
      const lines = content.trim().split(/\r?\n/);
      if (lines.length < 2) {
        this.products = [];
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      this.products = lines
        .slice(1)
        .filter(l => l.trim())
        .map(line => {
          const cols = line.split(",").map(c => c.trim());
          const row = {};
          headers.forEach((h, i) => { row[h] = cols[i] || ""; });
          return row;
        });

      this.categories = [...new Set(
        this.products.map(p => (p.kategori || "").toLowerCase()).filter(Boolean)
      )];
      const words = new Set();
      this.products.forEach(p => {
        `${p.nama} ${p.kategori}`.toLowerCase().split(/[^\w]+/).forEach(w => {
          if (w.length > 2) words.add(w);
        });
      });
      this.vocab = [...words];

      console.log(`[RAG] Berhasil memuat ${this.products.length} produk dari CSV`);
    } catch (err) {
      console.error("[RAG] Gagal memuat data CSV:", err);
      this.products = [];
    }
  }

  formatCurrency(numStr) {
    const num = Number(numStr);
    if (isNaN(num)) return numStr;
    return new Intl.NumberFormat("id-ID", {
      style: "currency", currency: "IDR", maximumFractionDigits: 0
    }).format(num);
  }

  isGreetingQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();
    const greetings = [
      "halo", "hai", "hi", "hey", "hello", "hei", "p", "ping", "test",
      "pagi", "selamat pagi", "siang", "selamat siang", "sore", "selamat sore",
      "malam", "selamat malam", "assalamualaikum", "assalamu'alaikum",
      "assalamu alaikum", "permisi"
    ];
    if (greetings.includes(q)) return true;
    if (/^(halo|hai|hi|hey|hello|selamat\s+(pagi|siang|sore|malam)|assalamu\s*alaikum)\b/i.test(q)) {
      const kw = ["produk", "harga", "katalog", "jual", "beli", ...this.vocab];
      return !kw.some(k => q.includes(k));
    }
    return false;
  }

  isAllProductsQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();
    const specific = [...this.categories, "warna", "ukuran", "bahan", "promo", "rekomendasi"];
    if (specific.some(t => q.includes(t))) return false;
    const patterns = [
      /^semua(\s+produk(nya)?)?$/,
      /^(apa|ada)\s+(aja|saja)(\s+produk(nya)?)?$/,
      /^produk\s+(apa|ada)\s+(aja|saja)$/,
      /^katalog(\s+(produk|lengkap))?$/,
      /^daftar\s+(produk|harga)$/,
      /^list\s+produk$/,
      /^koleksi(\s+lengkap)?$/,
      /^semuanya$/,
      /^jelasin\s+produk(nya)?$/
    ];
    return patterns.some(p => p.test(q));
  }

  search(query, k = this.topK) {
    if (!query || this.products.length === 0) return [];
    const q = query.toLowerCase().trim();

    if (this.isGreetingQuery(q)) return [];
    if (this.isAllProductsQuery(q)) return this.products;

    const matchedCategory = this.categories.find(c => q.includes(c));
    let candidates = this.products;
    if (matchedCategory) {
      candidates = this.products.filter(p => (p.kategori || "").toLowerCase() === matchedCategory);
    }

    const price = p => Number(p.harga) || 0;
    if (/(termurah|paling murah|harga terendah)/.test(q)) {
      return [...candidates].sort((a, b) => price(a) - price(b)).slice(0, k);
    }
    if (/(termahal|paling mahal|harga tertinggi)/.test(q)) {
      return [...candidates].sort((a, b) => price(b) - price(a)).slice(0, k);
    }

    const tokens = q.replace(/[^\w\s]/g, " ").split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));

    if (tokens.length === 0) return matchedCategory ? candidates : [];

    const scored = candidates.map(p => {
      let score = 0;
      const all = `${p.nama} ${p.kategori} ${p.deskripsi}`.toLowerCase();
      for (const t of tokens) {
        if ((p.nama || "").toLowerCase().includes(t)) score += 8;
        if ((p.kategori || "").toLowerCase().includes(t)) score += 5;
        if ((p.deskripsi || "").toLowerCase().includes(t)) score += 3;
        if (all.includes(t)) score += 1;
      }
      return { product: p, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length > 0) return scored.slice(0, k).map(x => x.product);
    if (matchedCategory) return candidates;
    return [];
  }

  buildContext(query) {
    const items = this.search(query);
    if (!items || items.length === 0) return "";

    const grouped = {};
    for (const p of items) {
      const cat = p.kategori || "Lainnya";
      (grouped[cat] = grouped[cat] || []).push(p);
    }

    let out = "Daftar Katalog Produk Toko Resmi:\n";
    for (const [cat, list] of Object.entries(grouped)) {
      out += `\n[Kategori: ${cat}]\n`;
      list.forEach(p => {
        out += `• ${p.nama} - Harga: ${this.formatCurrency(p.harga)}\n  Deskripsi: ${p.deskripsi}\n`;
        for (const [key, val] of Object.entries(p)) {
          if (!CORE.includes(key) && val) {
            out += `  ${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}\n`;
          }
        }
      });
    }
    return out.trim();
  }
}

module.exports = RAGEngine;