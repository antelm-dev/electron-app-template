import type { bridge } from "../preload/generated/ipc-bridge.js";

declare global {
  interface Window {
    ipc: typeof bridge;
  }
}

export {};
