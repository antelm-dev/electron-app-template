import { app, BrowserWindow, dialog, protocol } from "electron";

import type { RendererProtocol } from "./renderer-protocol.js";

type MaybePromise<T> = T | Promise<T>;

export interface BootstrapOptions {
  protocol?: RendererProtocol;
  initialize?: () => MaybePromise<void>;
  createWindow: () => MaybePromise<BrowserWindow>;
  dispose?: () => MaybePromise<void>;
  errorTitle?: string;
  singleInstance?: boolean;
}

export interface AppController {
  readonly started: Promise<void>;
  getMainWindow(): BrowserWindow | null;
}

export function bootstrapApp(options: BootstrapOptions): AppController {
  let mainWindow: BrowserWindow | null = null;
  let creatingWindow: Promise<BrowserWindow> | undefined;
  let shutdown: Promise<void> | undefined;
  let shutdownRequested = false;
  let shutdownComplete = false;

  const ownsInstance = options.singleInstance === false || app.requestSingleInstanceLock();
  if (!ownsInstance) app.quit();

  if (ownsInstance && options.protocol) {
    protocol.registerSchemesAsPrivileged([options.protocol.customScheme]);
  }

  const createMainWindow = async (): Promise<BrowserWindow> => {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
    if (creatingWindow) return creatingWindow;

    creatingWindow = Promise.resolve(options.createWindow()).then((window) => {
      mainWindow = window;
      window.once("closed", () => {
        if (mainWindow === window) mainWindow = null;
      });
      return window;
    });
    try {
      return await creatingWindow;
    } finally {
      creatingWindow = undefined;
    }
  };

  const dispose = (): Promise<void> => {
    shutdown ??= Promise.resolve()
      .then(() => options.dispose?.())
      .finally(() => options.protocol?.unregister());
    return shutdown;
  };

  const started = ownsInstance
    ? app.whenReady().then(async () => {
        try {
          options.protocol?.register();
          await options.initialize?.();
          await createMainWindow();
        } catch (error) {
          await dispose().catch((cleanupError: unknown) => console.error("Cleanup failed", cleanupError));
          dialog.showErrorBox(
            options.errorTitle ?? "Application could not start",
            error instanceof Error ? error.message : String(error),
          );
          app.exit(1);
        }
      })
    : Promise.resolve();

  if (ownsInstance) {
    app.on("second-instance", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });

    app.on("before-quit", (event) => {
      if (shutdownComplete) return;
      event.preventDefault();
      if (shutdownRequested) return;
      shutdownRequested = true;
      void dispose()
        .catch((error: unknown) => console.error("Application cleanup failed", error))
        .finally(() => {
          shutdownComplete = true;
          app.quit();
        });
    });
  }

  return {
    started,
    getMainWindow: () => mainWindow,
  };
}
