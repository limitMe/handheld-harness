import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { Settings } from '../shared/ipc'
import type { EngineEventPayload } from '../shared/engine'
import {
  EngineManager,
  FakeEngine,
  OpenCodeEngine,
  resolveEngineMode,
  resolveWorkspaceDir,
} from './engine'
import { readPinnedSdkVersion } from './engine/version'
import { log } from './log'
import { isDevMode } from './env'

/**
 * Electron-aware wiring for the engine layer. Kept outside `src/main/engine/`
 * because engine code must not import electron; everything platform-specific is
 * passed in as options.
 */

let manager: EngineManager | undefined

function readSdkVersion(): string {
  return readPinnedSdkVersion(app.getAppPath())
}

function serversDir(): string {
  return path.join(app.getPath('appData'), 'handheld-harness', 'servers')
}

export function getEngineManager(): EngineManager {
  if (!manager) throw new Error('Engine runtime has not been started')
  return manager
}

export function startEngineRuntime(getSettings: () => Settings): void {
  const mode = resolveEngineMode(process.env, isDevMode())
  const settings = getSettings()
  const workspace = resolveWorkspaceDir({
    settingsWorkspace: settings.engine.workspaceDir,
    env: process.env,
    isDev: isDevMode(),
    repositoryRoot: app.getAppPath(),
    defaultWorkspaceDir: app.getPath('documents'),
  })

  // The packaged default (OS documents folder) must exist before the engine
  // starts; a missing workspace makes the host refuse to launch the server.
  if (workspace.dir && workspace.source === 'release-default') {
    try {
      fs.mkdirSync(workspace.dir, { recursive: true })
    } catch (error) {
      log.warn('could not create the default workspace directory', {
        dir: workspace.dir,
        error: String(error),
      })
    }
  }

  manager = new EngineManager()
  manager.onEvent((payload: EngineEventPayload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('engine:event', payload)
    }
  })

  if (mode === 'fake') {
    const fixtureDir = path.join(app.getAppPath(), 'tests', 'fixtures', 'opencode', '1.18.34')
    manager.register(
      new FakeEngine({
        capabilities: process.env.HANDHELD_FAKE_CAPABILITIES,
        fixturePath: path.join(fixtureDir, 'basic-tool-permission.jsonl'),
        workspaceDir: workspace.dir,
      }),
      { default: true },
    )
    log.info('engine runtime starting (fake)', {
      capabilities: process.env.HANDHELD_FAKE_CAPABILITIES ?? 'default',
    })
    void manager
      .startAll()
      .catch((error: unknown) => log.error('fake engine failed', String(error)))
    return
  }

  const engine = new OpenCodeEngine({
    mode,
    workspaceDir: workspace.dir,
    serversDir: serversDir(),
    logsDir: path.join(app.getPath('userData'), 'logs'),
    sdkVersion: readSdkVersion(),
    baseDir: app.getAppPath(),
    resourcesDir: process.resourcesPath,
    externalUrl: process.env.HANDHELD_OPENCODE_URL,
    externalPassword: process.env.HANDHELD_OPENCODE_PASSWORD,
    configContent: process.env.HANDHELD_OPENCODE_CONFIG_CONTENT,
    logger: {
      error: (message: string, meta?: unknown) => log.error(message, meta),
      warn: (message: string, meta?: unknown) => log.warn(message, meta),
      info: (message: string, meta?: unknown) => log.info(message, meta),
      debug: (message: string, meta?: unknown) => log.debug(message, meta),
    },
  })
  manager.register(engine, { default: true })
  log.info('engine runtime starting', {
    mode,
    workspaceSource: workspace.source,
    workspaceDir: workspace.dir,
  })
  void manager
    .startAll()
    .catch((error: unknown) => log.error('engine runtime failed', String(error)))
}

export function stopEngineRuntime(): void {
  if (!manager) return
  void manager
    .stopAll()
    .catch((error: unknown) => log.error('engine shutdown failed', String(error)))
}
