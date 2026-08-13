import * as commonjsModule from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import * as typescriptModule from "@rollup/plugin-typescript";
import ipcBridge from "electron-ipc-module/rollup-plugin";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  rollup,
  watch,
  type OutputOptions,
  type Plugin as RollupPlugin,
  type RollupOptions,
  type RollupWatcher,
} from "rollup";
import electronRun from "rollup-plugin-electron-run/rollup-plugin";
import { defineConfig, type Plugin as VitePlugin } from "vite";

const root = import.meta.dirname;
const outDir = resolve(root, "out");
const devServerUrl = "http://localhost:5173";
// TypeScript 6 currently resolves these conditional-export defaults as module
// namespaces under NodeNext even though their ESM runtime exports are functions.
const commonjs = commonjsModule.default as unknown as (options?: unknown) => RollupPlugin;
const typescript = typescriptModule.default as unknown as (options?: unknown) => RollupPlugin;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

function buildPreload(): import("rollup").Plugin {
  return {
    name: "build-preload-first",
    buildStart: {
      order: "post",
      sequential: true,
      async handler() {
        for (const file of sourceFiles(resolve(root, "src/preload"))) {
          if (!file.includes(`${resolve(root, "src/preload/generated")}`)) {
            this.addWatchFile(file);
          }
        }

        const bundle = await rollup({
          input: resolve(root, "src/preload/index.ts"),
          external: ["electron"],
          plugins: [
            nodeResolve({ exportConditions: ["node"] }),
            commonjs(),
            typescript({
              tsconfig: resolve(root, "tsconfig.preload.json"),
              compilerOptions: {
                composite: false,
                declaration: false,
                module: "ESNext",
                moduleResolution: "Bundler",
                noEmit: false,
                sourceMap: true,
              },
            }),
          ],
        });

        try {
          await bundle.write({
            file: resolve(outDir, "preload/index.cjs"),
            format: "cjs",
            inlineDynamicImports: true,
            sourcemap: true,
          });
        } finally {
          await bundle.close();
        }
      },
    },
  };
}

function electronConfig(development: boolean): RollupOptions {
  return {
    input: resolve(root, "src/main/index.ts"),
    external: ["electron", /^node:/],
    output: {
      file: resolve(outDir, "main/index.cjs"),
      format: "cjs",
      sourcemap: true,
    },
    plugins: [
      ipcBridge({
        ipcDir: resolve(root, "src/main/ipc"),
        outFile: resolve(root, "src/preload/generated/ipc-bridge.ts"),
        tsconfig: resolve(root, "tsconfig.main.json"),
      }),
      buildPreload(),
      nodeResolve({ exportConditions: ["node"] }),
      commonjs(),
      typescript({
        tsconfig: resolve(root, "tsconfig.main.json"),
        compilerOptions: {
          composite: false,
          declaration: false,
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: false,
          sourceMap: true,
        },
      }),
      development &&
        electronRun({
          entry: "index.cjs",
          electronPath: createRequire(import.meta.url)("electron"),
          cwd: root,
          env: { VITE_DEV_SERVER_URL: devServerUrl },
        }),
    ],
  };
}

function electronTargets(development: boolean): VitePlugin {
  let watcher: RollupWatcher | undefined;

  return {
    name: "electron-targets",
    async buildStart() {
      if (development) return;
      const config = electronConfig(false);
      const bundle = await rollup(config);
      try {
        await bundle.write(config.output as OutputOptions);
      } finally {
        await bundle.close();
      }
    },
    configureServer(server) {
      watcher = watch(electronConfig(true));
      watcher.on("event", (event) => {
        if (event.code === "ERROR") server.config.logger.error(event.error.message);
      });
      server.httpServer?.once("close", () => void watcher?.close());
    },
  };
}

export default defineConfig(({ command }) => ({
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
    outDir: resolve(outDir, "renderer"),
    emptyOutDir: true,
  },
  plugins: [electronTargets(command === "serve")],
}));
