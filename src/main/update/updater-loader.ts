import type { UpdateUpdater } from './service'

// A variable specifier keeps the electron-updater import out of TypeScript's
// module resolution and the bundler's static analysis (spec 19). The dependency
// ships in `dependencies` and is loaded lazily on the first update check.
const ELECTRON_UPDATER: string = 'electron-updater'

export async function loadElectronUpdater(): Promise<UpdateUpdater> {
  const module = (await import(/* @vite-ignore */ ELECTRON_UPDATER)) as {
    autoUpdater?: UpdateUpdater
    default?: { autoUpdater: UpdateUpdater }
  }
  // `electron-updater` is CommonJS; depending on how Node's interop exposes it,
  // the live singleton is on either the namespace or its `default`.
  const updater = module.autoUpdater ?? module.default?.autoUpdater
  if (!updater) throw new Error('electron-updater did not expose autoUpdater')
  return updater
}
