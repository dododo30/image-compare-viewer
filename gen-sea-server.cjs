// 生成内嵌 dist 全部资源的单文件服务器（供 Node SEA 打包）
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function walk(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const entries = walk(dist).map((rel) => {
  const buf = fs.readFileSync(path.join(dist, rel));
  return `  ${JSON.stringify("/" + rel)}: { type: ${JSON.stringify(
    mime[path.extname(rel).toLowerCase()] || "application/octet-stream"
  )}, data: ${JSON.stringify(buf.toString("base64"))} },`;
});

const server = `// Auto-generated single-file server for SEA
const http = require("http");
const { exec } = require("child_process");

const FILES = {
${entries.join("\n")}
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = FILES[p];
  if (!f) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": f.type, "Cache-Control": "no-cache" });
  res.end(Buffer.from(f.data, "base64"));
});

function listen(port, tries) {
  server.once("error", () => {
    if (tries > 0) listen(port + 1, tries - 1);
  });
  server.listen(port, "127.0.0.1", () => {
    const url = "http://localhost:" + port + "/";
    console.log("Image Viewer running at " + url);
    console.log("Close this window to stop.");
    exec('start "" "' + url + '"');
  });
}
listen(4173, 20);
`;

fs.writeFileSync(path.join(__dirname, "sea-server.cjs"), server);
console.log("sea-server.cjs written:", (server.length / 1024 / 1024).toFixed(2), "MB");
