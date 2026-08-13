import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  handler: undefined as ((request: Request) => Promise<Response>) | undefined,
  protocol: {
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>) => {
      electron.handler = handler;
    }),
    unhandle: vi.fn(),
  },
}));

vi.mock("electron", () => ({ protocol: electron.protocol }));

import { createRendererProtocol, resolveRendererPath } from "../src/main/core/renderer-protocol.js";

describe("renderer protocol", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "electron-template-protocol-"));
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, "index.html"), "<h1>app</h1>");
    await writeFile(join(directory, "assets", "app.js"), "console.log('app')");
    electron.handler = undefined;
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("confines decoded paths to the renderer directory", () => {
    expect(resolveRendererPath(directory, "/assets/app.js")).toMatchObject({
      ok: true,
      requested: "assets/app.js",
    });
    expect(resolveRendererPath(directory, "/%2e%2e/secret.txt")).toEqual({ ok: false, status: 403 });
    expect(resolveRendererPath(directory, "/assets%2fsecret.txt")).toEqual({ ok: false, status: 400 });
    expect(resolveRendererPath(directory, "/bad%zz")).toEqual({ ok: false, status: 400 });
  });

  it("serves assets, falls back for SPA routes, and never falls back for missing files", async () => {
    const renderer = createRendererProtocol({ directory });
    renderer.register();
    const handle = electron.handler!;

    const asset = await handle(new Request("app://bundle/assets/app.js"));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("x-content-type-options")).toBe("nosniff");
    expect(asset.headers.get("content-security-policy")).toContain("default-src 'self'");

    const route = await handle(new Request("app://bundle/settings/profile"));
    expect(route.status).toBe(200);
    expect(await route.text()).toContain("<h1>app</h1>");

    const missing = await handle(new Request("app://bundle/assets/missing.js"));
    expect(missing.status).toBe(404);
  });

  it("requires the exact app origin and read-only methods", async () => {
    const renderer = createRendererProtocol({ directory });
    renderer.register();
    const handle = electron.handler!;

    expect((await handle(new Request("app://other/index.html"))).status).toBe(403);
    expect((await handle(new Request("app://bundle/index.html", { method: "POST" }))).status).toBe(405);

    const head = await handle(new Request("app://bundle/index.html", { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });
});
