import type {
  AgentEngine,
  EngineEventPayload,
  EngineInfo,
  RestartableEngine,
  SessionRef,
} from '../../shared/engine'

/** Engines optionally expose lifecycle and restart hooks; plain adapters may omit them. */
export type ManagedEngine = AgentEngine &
  Partial<RestartableEngine> & { start?(): Promise<void>; stop?(): Promise<void> }

export class EngineManager {
  private readonly engines = new Map<string, ManagedEngine>()
  private readonly listeners = new Set<(payload: EngineEventPayload) => void>()
  private defaultEngineId: string | undefined

  register(engine: ManagedEngine, opts?: { default?: boolean }): void {
    this.engines.set(engine.id, engine)
    engine.onEvent((event) => {
      for (const listener of this.listeners) listener({ engineId: engine.id, event })
    })
    if (opts?.default || !this.defaultEngineId) this.defaultEngineId = engine.id
  }

  has(engineId: string): boolean {
    return this.engines.has(engineId)
  }

  get(engineId?: string): ManagedEngine {
    const id = engineId ?? this.defaultEngineId
    if (!id) throw new Error('No engine is registered')
    const engine = this.engines.get(id)
    if (!engine) throw new Error(`Unknown engineId: ${id}`)
    return engine
  }

  getByRef(ref: SessionRef): ManagedEngine {
    return this.get(ref.engineId)
  }

  list(): EngineInfo[] {
    return [...this.engines.values()].map((engine) => ({ engineId: engine.id, kind: engine.kind }))
  }

  onEvent(listener: (payload: EngineEventPayload) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async startAll(): Promise<void> {
    await Promise.all([...this.engines.values()].map((engine) => engine.start?.()))
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.engines.values()].map((engine) => engine.stop?.()))
  }

  async restart(engineId?: string): Promise<void> {
    const engine = this.get(engineId)
    if (!engine.restart) throw new Error(`Engine ${engine.id} does not support restart`)
    await engine.restart()
  }
}
