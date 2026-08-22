import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from "electron";

export interface SecureWindowOptions extends Omit<
  BrowserWindowConstructorOptions,
  "webPreferences"
> {
  preload: string;
  webPreferences?: Omit<
    NonNullable<BrowserWindowConstructorOptions["webPreferences"]>,
    "preload" | "sandbox" | "contextIsolation" | "nodeIntegration"
  >;
}

export interface NavigationPolicy {
  isAppUrl(url: string): boolean;
  isExternalUrl?: (url: string) => boolean;
}

export function createSecureBrowserWindow(options: SecureWindowOptions): BrowserWindow {
  const { preload, webPreferences, ...windowOptions } = options;
  return new BrowserWindow({
    show: false,
    backgroundColor: "#0b1020",
    ...windowOptions,
    webPreferences: {
      ...webPreferences,
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function createAppUrlChecker(options: {
  production: boolean;
  scheme: string;
  host: string;
  devServerUrl: string;
}): (value: string) => boolean {
  const devOrigin = new URL(options.devServerUrl).origin;
  return (value: string): boolean => {
    try {
      const url = new URL(value);
      if (url.username || url.password) return false;
      return options.production
        ? url.protocol === `${options.scheme}:` && url.hostname === options.host
        : url.origin === devOrigin;
    } catch {
      return false;
    }
  };
}

export function applyNavigationPolicy(window: BrowserWindow, policy: NavigationPolicy): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if ((policy.isExternalUrl ?? isAllowedExternalUrl)(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  const preventUnknownNavigation = (event: Electron.Event, url: string): void => {
    if (!policy.isAppUrl(url)) event.preventDefault();
  };
  window.webContents.on("will-navigate", preventUnknownNavigation);
  window.webContents.on("will-redirect", preventUnknownNavigation);
}
