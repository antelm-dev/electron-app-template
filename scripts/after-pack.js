import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { join } from "node:path";

const BINARY_SUFFIX = { darwin: ".app", win32: ".exe", linux: "" };

/**
 * electron-builder afterPack hook: burns Electron's fuses into the packaged
 * binary. Runs before code signing, so the signature covers the flipped bits.
 *
 * These are build-time kill switches for capabilities the renderer sandbox and
 * CSP cannot reach. Without them a packaged app can still be relaunched as a
 * plain Node process (`ELECTRON_RUN_AS_NODE=1`) or handed arbitrary flags via
 * `NODE_OPTIONS`, which sidesteps every runtime protection in src/main.
 */
export default async function afterPack(context) {
  const platform = context.electronPlatformName;
  const suffix = BINARY_SUFFIX[platform];
  if (suffix === undefined) {
    throw new Error(`Unsupported platform for fuses: ${platform}`);
  }

  const name = context.packager.executableName ?? context.packager.appInfo.productFilename;

  await flipFuses(join(context.appOutDir, `${name}${suffix}`), {
    version: FuseVersion.V1,
    // Flipping fuses invalidates an ad-hoc signature, which is what unsigned
    // Apple Silicon builds get. Re-apply it so the app still launches.
    resetAdHocDarwinSignature: platform === "darwin",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Safe because electron-builder.yml sets asar: true.
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
}
