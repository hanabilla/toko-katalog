const Groq = require("groq-sdk");
const path = require("path");
const RAGEngine = require("../lib/rag");

const SHOP_NAME = "Charmigos";
const SHOPEE_URL = "https://shopee.co.id/charmigos";

const rag = new RAGEngine(path.join(process.cwd(), "data", "products.csv"));
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, history = [] } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Pesan kosong" });
    }
    const text = message.trim().slice(0, 500);

    // Lapisan 1: sapaan dijawab tanpa AI
    if (rag.isGreetingQuery(text)) {
      return res.json({
        reply: `Halo! Selamat datang di ${SHOP_NAME}. Ada yang bisa saya bantu seputar produk kami?`
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(h => h && ["user", "assistant"].includes(h.role) && typeof h.content === "string")
          .slice(-6)
          .map(h => ({ role: h.role, content: h.content.slice(0, 1000) }))
      : [];

    // Lapisan 2: RAG (pertanyaan lanjutan memakai konteks pertanyaan sebelumnya)
    let ctx = rag.buildContext(text);
    if (!ctx && safeHistory.length > 0) {
      const prev = safeHistory.filter(h => h.role === "user").slice(-2).map(h => h.content).join(" ");
      ctx = rag.buildContext(`${prev} ${text}`);
    }

    const systemPrompt = `Anda adalah asisten penjualan resmi lapak "${SHOP_NAME}" di Shopee. Jawab dalam Bahasa Indonesia yang ramah, singkat, dan rapi.

ATURAN:
1. Jawab HANYA berdasarkan Konteks Katalog di bawah. Jangan mengarang harga, bahan, ukuran, warna, stok, atau spesifikasi.
2. Jangan mencampur deskripsi antar produk.
3. Sebut harga persis seperti di katalog.
4. Jika produk atau informasi tidak ada di katalog, katakan dengan sopan bahwa informasinya belum tersedia dan arahkan pelanggan ke lapak Shopee: ${SHOPEE_URL}
5. Jangan menyebut istilah teknis seperti "CSV", "database", atau "konteks".
6. Tulis daftar produk per baris dengan tanda •, jangan dalam satu paragraf.

${ctx || "Konteks Katalog: (tidak ada produk yang cocok dengan pertanyaan ini)"}`;

    const models = [
      process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      "openai/gpt-oss-20b",
      "allam-2-7b"
    ];

    let lastErr = null;
    for (const model of models) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...safeHistory,
            { role: "user", content: text }
          ],
          max_tokens: 1000
        });
        let reply = completion.choices?.[0]?.message?.content || "";
        reply = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (reply) return res.json({ reply });
      } catch (err) {
        lastErr = err;
        console.warn(`[Groq ${model}] gagal: ${err.message}`);
      }
    }
    throw lastErr || new Error("Semua model gagal");
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Terjadi gangguan, silakan coba lagi sebentar." });
  }
};