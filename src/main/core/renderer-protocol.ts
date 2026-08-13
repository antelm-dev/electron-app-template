import { protocol } from "electron";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface RendererProtocolOptions {
  scheme?: string;
  host?: string;
  directory: string;
  fallback?: string;
  contentSecurityPolicy?: string;
}

export interface RendererProtocol {
  readonly scheme: string;
  readonly host: string;
  readonly url: string;
  readonly customScheme: Electron.CustomScheme;
  register(): void;
  unregister(): void;
}

export type RendererPathResult =
  | { ok: true; file: string; requested: string }
  | { ok: false; status: 400 | 403 };

function validProtocolPart(value: string, label: string): string {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(value)) {
    throw new TypeError(`Invalid renderer protocol ${label}: ${value}`);
  }
  return value.toLowerCase();
}

export function resolveRendererPath(
  directory: string,
  encodedPathname: string,
  fallback = "index.html",
): RendererPathResult {
  if (/%(?:2f|5c)/i.test(encodedPathname)) return { ok: false, status: 400 };

  let requested: string;
  try {
    requested = decodeURIComponent(encodedPathname).replace(/^\/+/, "") || fallback;
  } catch {
    return { ok: false, status: 400 };
  }

  if (requested.includes("\0") || requested.includes("\\")) {
    return { ok: false, status: 400 };
  }

  const base = resolve(directory);
  const file = resolve(base, requested);
  const rel = relative(base, file);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { ok: false, status: 403 };
  }

  return { ok: true, file, requested };
}

function responseHeaders(file: string, contentSecurityPolicy: string): HeadersInit {
  return {
    "content-security-policy": contentSecurityPolicy,
    "content-type": MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
}

export function createRendererProtocol(options: RendererProtocolOptions): RendererProtocol {
  const scheme = validProtocolPart(options.scheme ?? "app", "scheme");
  const host = validProtocolPart(options.host ?? "bundle", "host");
  const directory = resolve(options.directory);
  const fallback = options.fallback ?? "index.html";
  const contentSecurityPolicy =
    options.contentSecurityPolicy ??
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  const fallbackResult = resolveRendererPath(directory, `/${fallback}`, fallback);
  if (!fallbackResult.ok) throw new TypeError("Renderer protocol fallback must stay inside directory");
  const fallbackFile = fallbackResult.file;

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.protocol !== `${scheme}:` || url.hostname !== host || url.username || url.password) {
      return new Response("Forbidden", { status: 403 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const result = resolveRendererPath(directory, url.pathname, fallback);
    if (!result.ok) return new Response(result.status === 400 ? "Bad request" : "Forbidden", result);

    let file = result.file;
    let data: Uint8Array;
    try {
      data = await readFile(file);
    } catch {
      if (extname(result.requested)) return new Response("Not found", { status: 404 });
      file = fallbackFile;
      try {
        data = await readFile(file);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    const body = new Uint8Array(data.byteLength);
    body.set(data);
    return new Response(request.method === "HEAD" ? null : body.buffer, {
      status: 200,
      headers: responseHeaders(file, contentSecurityPolicy),
    });
  };

  return {
    scheme,
    host,
    url: `${scheme}://${host}/`,
    customScheme: {
      scheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
    register: () => protocol.handle(scheme, handler),
    unregister: () => protocol.unhandle(scheme),
  };
}
