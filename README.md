# Electron App Template

A small, secure Electron starter built with:

- [Vite](https://vite.dev/) and Rollup for one lightweight main/preload/renderer configuration
- [electron-ipc-module](https://github.com/antelm-dev/electron-ipc-module) for generated, type-safe IPC
- [electron-run](https://github.com/antelm-dev/electron-run) for robust Electron restart and shutdown
- [electron-builder](https://www.electron.build/) for distributable packages
- TypeScript and a framework-neutral vanilla renderer

## Use this template

Click **Use this template** on GitHub, clone the new repository, then update:

- `name`, `version`, `description`, and `author` in `package.json`
- `appId` and `productName` in `electron-builder.yml`
- the page title in `src/renderer/index.html`

Install and start development:

```bash
pnpm install
pnpm dev
```

The renderer gets native Vite HMR. A Rollup watcher builds preload and main code; changes restart Electron through `electron-run` only after both outputs are ready.

## Commands

```bash
pnpm dev          # development server, Electron, and watch mode
pnpm typecheck    # regenerate IPC bridge and check every process and test
pnpm test         # protocol, navigation, and lifecycle tests
pnpm build        # typecheck, test, and production build into out/
pnpm preview      # build and run the production output
pnpm pack         # unpacked application for the current platform
pnpm dist         # installers for the current platform
pnpm dist:win     # Windows targets
pnpm dist:mac     # macOS targets (run on macOS)
pnpm dist:linux   # Linux targets (run on Linux)
```

The included GitHub Actions workflow checks generated IPC drift and performs a clean production build on pushes and pull requests.

## Project layout

```text
src/
├── main/
│   ├── core/
│   │   ├── bootstrap.ts
│   │   ├── renderer-protocol.ts
│   │   └── window-security.ts
│   ├── index.ts
│   └── ipc/*.ipc.ts
├── preload/
│   ├── index.ts
│   └── generated/ipc-bridge.ts
└── renderer/
    ├── index.html
    └── src/
```

`vite.config.ts` is the single build configuration. Vite owns the renderer while a small in-file plugin coordinates Rollup for preload and main. The IPC and electron-run plugins are attached to the main watcher. The preload exposes only the generated narrow bridge; it does not expose Electron's raw `ipcRenderer` API.

The generated bridge is committed intentionally so renderer types remain available before the first build and `pnpm check:ipc` can detect drift in CI.

## Application foundation

`src/main/index.ts` is the composition root. It creates the IPC container, renderer protocol, navigation policy, and main window, then passes their lifecycle hooks to `bootstrapApp`.

### Production renderer protocol

Development pages load from the Vite server. A packaged application loads from `app://bundle/`, which gives the renderer a standard, secure origin instead of `file://`.

The protocol handler:

- accepts only the exact configured scheme and host
- permits only `GET` and `HEAD`
- rejects malformed encoding, encoded separators, backslashes, null bytes, and paths outside the renderer directory
- sends an explicit Content Security Policy, MIME types, and `X-Content-Type-Options: nosniff`
- returns `404` for missing asset files
- falls back to `index.html` only for extensionless SPA routes

Change the scheme and host in `src/main/index.ts` if your application needs branded URLs. Keep the directory pointed at Vite's renderer output.

### Window security

Create application windows through `createSecureBrowserWindow`. It enforces sandboxing, context isolation, and disabled Node integration after merging caller options, so those invariants cannot be accidentally overridden.

`applyNavigationPolicy` denies new Electron windows and blocks top-level navigation outside the application origin. HTTPS and `mailto:` window-open requests may be passed to the operating-system browser; adjust `isAllowedExternalUrl` for a stricter product policy.

### Lifecycle

`bootstrapApp` provides:

- single-instance locking and restore/focus behavior on a second launch
- privileged protocol registration before Electron becomes ready
- ordered protocol, service, and window initialization
- main-window recreation on macOS activation
- normal non-macOS last-window shutdown
- one awaited, idempotent cleanup before final quit
- protocol unregistration and a visible startup error

Put application service setup in `initialize`, and release IPC containers, databases, file watchers, or other resources in `dispose`.

## Choose a renderer

The included renderer is plain TypeScript. To use a framework, install its Vite plugin, add it to the top-level `plugins` array in `vite.config.ts`, then replace `src/renderer` with the framework entry files.

For example, React needs `react`, `react-dom`, `@vitejs/plugin-react`, and corresponding type packages; Vue needs `vue` and `@vitejs/plugin-vue`; Svelte needs `svelte` and `@sveltejs/vite-plugin-svelte`.

## Add an IPC module

Create a file such as `src/main/ipc/settings.ipc.ts`:

```ts
import { defineIpcModule, handle } from "electron-ipc-module";

export function createSettingsIpc() {
  return defineIpcModule("settings", {
    read: handle(() => ({ theme: "dark" })),
  });
}
```

Load it from `src/main/index.ts`, run `pnpm generate:ipc`, and call the generated API from the renderer:

```ts
const settings = await window.ipc.settings.read();
```

## Security defaults

The starter enables context isolation and renderer sandboxing, disables Node integration, and bundles the preload into one CommonJS file. Keep those defaults unless the application has a reviewed reason to change them.
