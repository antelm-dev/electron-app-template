import ipcBridge from "electron-ipc-module/rollup-plugin";
import electron from "vite-plugin-electron-run";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  root: resolve(root, "src/renderer"),
  base: "./",
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
  },
  build: {
    outDir: resolve(root, "out/renderer"),
    emptyOutDir: true,
  },
  plugins: [
    electron({
      cwd: root,
      main: {
        input: "src/main/index.ts",
        plugins: [
          ipcBridge({
            ipcDir: resolve(root, "src/main/ipc"),
            outFile: resolve(root, "src/preload/generated/ipc-bridge.ts"),
            tsconfig: resolve(root, "tsconfig.main.json"),
          }),
        ],
      },
      preload: {
        input: "src/preload/index.ts",
      },
    }),
  ],
});
