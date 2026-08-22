import { app } from "electron";
import { defineIpcModule, handle } from "electron-ipc-module";

export function createAppIpc() {
  return defineIpcModule("app", {
    info: handle(() => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
    })),
  });
}
