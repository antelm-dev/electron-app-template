import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
}));

import {
  createAppUrlChecker,
  isAllowedExternalUrl,
} from "../src/main/core/window-security.js";

describe("window URL policies", () => {
  it("matches an exact custom-protocol origin in production", () => {
    const allowed = createAppUrlChecker({
      production: true,
      scheme: "app",
      host: "bundle",
      devServerUrl: "http://localhost:5173",
    });

    expect(allowed("app://bundle/settings")).toBe(true);
    expect(allowed("app://other/settings")).toBe(false);
    expect(allowed("https://bundle/settings")).toBe(false);
  });

  it("matches only the Vite server origin in development", () => {
    const allowed = createAppUrlChecker({
      production: false,
      scheme: "app",
      host: "bundle",
      devServerUrl: "http://localhost:5173",
    });

    expect(allowed("http://localhost:5173/src/index.ts")).toBe(true);
    expect(allowed("http://localhost:5174/")).toBe(false);
    expect(allowed("http://localhost:5173.evil.example/")).toBe(false);
  });

  it("allows only explicit external protocols", () => {
    expect(isAllowedExternalUrl("https://example.com/docs")).toBe(true);
    expect(isAllowedExternalUrl("mailto:hello@example.com")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com")).toBe(false);
    expect(isAllowedExternalUrl("file:///secret.txt")).toBe(false);
  });
});

