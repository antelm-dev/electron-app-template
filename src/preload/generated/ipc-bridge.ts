import { ipcRenderer } from 'electron';
import type { Serializable } from 'electron-ipc-module';

export const bridge = {
  app: {
    info: (): Promise<Serializable<{ name: string; version: string; platform: NodeJS.Platform; }>> => ipcRenderer.invoke("app:info"),
  },
} as const;
