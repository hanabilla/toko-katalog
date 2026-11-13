const SHOP_NAME = "Charmigos";
const WA_NUMBER = "62895423714747";
const SHOPEE_URL = "https://shopee.co.id/charmigos";

let products = [];
let activeCat = "Semua";
let history = [];
let busy = false;
const $ = (id) => document.getElementById(id);

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
}

const rupiah = (n) =>
  isNaN(Number(n)) ? n : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n));

const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

function renderFilters() {
  const box = $("filters");
  box.innerHTML = "";
  ["Semua", ...new Set(products.map((p) => p.kategori))].forEach((c) => {
    const b = document.createElement("button");
    b.textContent = c;
    b.className = "chip" + (c === activeCat ? " active" : "");
    b.onclick = () => { activeCat = c; renderFilters(); renderGrid(); };
    box.appendChild(b);
  });
}

function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  products.filter((p) => activeCat === "Semua" || p.kategori === activeCat).forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = p.kategori;
    const h3 = document.createElement("h3"); h3.textContent = p.nama;
    const price = document.createElement("p"); price.className = "price"; price.textContent = rupiah(p.harga);
    const desc = document.createElement("p"); desc.className = "desc"; desc.textContent = p.deskripsi;
    const a = document.createElement("a");
    a.className = "btn btn-wa"; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Tanya via WhatsApp";
    a.href = waLink(`Halo, saya ingin bertanya tentang produk kategori ${p.kategori}: ${p.nama}`);
    card.append(badge, h3, price, desc, a);
    grid.appendChild(card);
  });
}

async function loadProducts() {
  try {
    const res = await fetch("data/products.csv");
    products = parseCSV(await res.text());
    renderFilters();
    renderGrid();
  } catch (e) {
    $("grid").textContent = "Gagal memuat produk.";
  }
}

function addBubble(text, who) {
  const div = document.createElement("div");
  div.className = "bubble " + who;
  div.textContent = text;
  $("chatMessages").appendChild(div);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
  return div;
}

async function sendChat() {
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = "";
  busy = true;
  addBubble(text, "user");
  const typing = addBubble("Mengetik...", "bot");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    const data = await res.json();
    const reply = (data.reply || data.error || "Maaf, terjadi gangguan.").replace(/\*+/g, "");
    typing.textContent = reply;
    history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    history = history.slice(-6);
  } catch (e) {
    typing.textContent = "Gagal terhubung ke server.";
  }
  busy = false;
}

document.title = `${SHOP_NAME} - Katalog`;
$("shopName").textContent = SHOP_NAME;
$("chatTitle").textContent = `Asisten ${SHOP_NAME}`;
$("shopeeLink").href = SHOPEE_URL;
$("waMain").href = waLink("Halo, saya ingin bertanya tentang produk di toko ini");
$("chatToggle").onclick = () => $("chatBox").classList.toggle("hidden");
$("chatClose").onclick = () => $("chatBox").classList.add("hidden");
$("chatSend").onclick = sendChat;
$("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
addBubble(`Halo! Saya asisten ${SHOP_NAME}. Silakan tanya soal produk atau harga.`, "bot");
loadProducts();