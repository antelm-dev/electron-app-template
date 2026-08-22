import { app, type BrowserWindow } from "electron";
import { join } from "node:path";

import { createIpcContainer } from "electron-ipc-module";
import { createRendererProtocol } from "electron-renderer-protocol";

import { bootstrapApp } from "./core/bootstrap.js";
import {
  applyNavigationPolicy,
  createAppUrlChecker,
  createSecureBrowserWindow,
} from "./core/window-security.js";
import { createAppIpc } from "./ipc/app.ipc.js";

const ipc = createIpcContainer();
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const rendererProtocol = createRendererProtocol({
  scheme: "app",
  host: "bundle",
  directory: join(__dirname, "../renderer"),
});
const isAppUrl = createAppUrlChecker({
  production: app.isPackaged,
  scheme: rendererProtocol.scheme,
  host: rendererProtocol.host,
  devServerUrl,
});

async function createWindow(): Promise<BrowserWindow> {
  const window = createSecureBrowserWindow({
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    preload: join(__dirname, "../preload/index.cjs"),
  });

  window.once("ready-to-show", () => window.show());
  applyNavigationPolicy(window, { isAppUrl });

  if (app.isPackaged) {
    await window.loadURL(rendererProtocol.url);
  } else {
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    window.webContents.on("did-fail-load", (_event, _code, _description, url, isMainFrame) => {
      if (!isMainFrame || !isAppUrl(url) || window.isDestroyed()) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void window.loadURL(devServerUrl), 300);
    });
    window.once("closed", () => clearTimeout(retryTimer));
    await window.loadURL(devServerUrl).catch(() => undefined);
  }

  return window;
}

bootstrapApp({
  protocol: app.isPackaged ? rendererProtocol : undefined,
  errorTitle: "Electron App could not start",
  initialize: async () => {
    await ipc.loadAll({ app: createAppIpc() });
  },
  createWindow,
  dispose: () => ipc.dispose(),
});
