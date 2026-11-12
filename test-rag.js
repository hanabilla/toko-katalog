const RAG = require("./lib/rag");
const r = new RAG("data/products.csv");
console.log(r.buildContext("ada produk apa saja?"));
console.log("---");
console.log(r.buildContext("resin termurah"));
console.log("---");
console.log(r.buildContext("halo kak") === "" ? "sapaan OK" : "sapaan SALAH");