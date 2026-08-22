import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const app = {
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    exit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn((event: string, listener: (...args: any[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
  };
  return {
    app,
    listeners,
    windows: [] as any[],
    dialog: { showErrorBox: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn() },
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  BrowserWindow: { getAllWindows: () => electron.windows },
  dialog: electron.dialog,
  protocol: electron.protocol,
}));

import { bootstrapApp } from "../src/main/core/bootstrap.js";

describe("bootstrapApp", () => {
  beforeEach(() => {
    electron.listeners.clear();
    electron.windows.length = 0;
  });

  it("registers the scheme before readiness and initializes before creating a window", async () => {
    const calls: string[] = [];
    const window = {
      once: vi.fn(),
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      focus: vi.fn(),
    } as any;
    const rendererProtocol = {
      scheme: "app",
      host: "bundle",
      url: "app://bundle/",
      customScheme: { scheme: "app", privileges: { secure: true } },
      register: vi.fn(() => calls.push("protocol")),
      unregister: vi.fn(),
    };

    const controller = bootstrapApp({
      protocol: rendererProtocol,
      initialize: () => {
        calls.push("initialize");
      },
      createWindow: () => {
        calls.push("window");
        return window;
      },
    });

    expect(electron.protocol.registerSchemesAsPrivileged).toHaveBeenCalledOnce();
    await controller.started;
    expect(calls).toEqual(["protocol", "initialize", "window"]);
  });

  it("awaits cleanup once before allowing quit", async () => {
    let releaseCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => (releaseCleanup = resolve));
    const unregister = vi.fn();
    const controller = bootstrapApp({
      protocol: {
        scheme: "app",
        host: "bundle",
        url: "app://bundle/",
        customScheme: { scheme: "app", privileges: {} },
        register: vi.fn(),
        unregister,
      },
      createWindow: () => ({ once: vi.fn(), isDestroyed: () => false }) as any,
      dispose: () => cleanup,
    });
    await controller.started;

    const beforeQuit = electron.listeners.get("before-quit")![0]!;
    const event = { preventDefault: vi.fn() };
    beforeQuit(event);
    beforeQuit(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(electron.app.quit).not.toHaveBeenCalled();

    releaseCleanup();
    await vi.waitFor(() => expect(electron.app.quit).toHaveBeenCalledOnce());
    expect(unregister).toHaveBeenCalledOnce();
  });
});
