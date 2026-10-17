// Electron 主进程
// 开发模式（--dev）：启动 Vite dev server 并加载 http://localhost:3000
// 生产模式：通过自定义 app:// 协议加载打包好的 dist/（支持 fetch，demo 图片可用）
const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const DEV_PORT = 3000;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const DIST_DIR = path.join(__dirname, "..", "dist");
const IS_DEV = process.argv.includes("--dev");

let devServer = null;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url, { cache: "no-store" })
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) reject(new Error(`等待开发服务器超时: ${url}`));
          else setTimeout(tick, 400);
        });
    };
    tick();
  });
}

function startVite() {
  const viteJs = path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js");
  devServer = spawn(process.execPath, [viteJs], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
}

function killDevServer() {
  if (!devServer || devServer.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(devServer.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    devServer.kill();
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#171717",
    title: "图片对比查看器",
    webPreferences: { contextIsolation: true },
  });

  win.webContents.on("did-finish-load", () => {
    console.log("页面加载完成");
    if (process.env.SMOKE_TEST) setTimeout(() => app.quit(), 1500);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("渲染进程异常退出:", details.reason);
  });

  if (IS_DEV) {
    startVite();
    await waitForServer(DEV_URL);
    win.loadURL(DEV_URL);
  } else {
    if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
      console.error("未找到 dist/index.html，请先运行 npm run build");
      app.quit();
      return;
    }
    protocol.handle("app", (req) => {
      const p = decodeURIComponent(new URL(req.url).pathname);
      return net.fetch(pathToFileURL(path.join(DIST_DIR, p)).toString());
    });
    win.loadURL("app://-/index.html");
  }
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (err) {
    console.error("启动失败:", err);
    app.quit();
    return;
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killDevServer();
});
