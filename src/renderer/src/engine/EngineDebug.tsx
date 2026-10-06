import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineEvent, EngineInfo, EngineSnapshot } from '@shared/engine'
import { Button, Overlay } from '../ui'
import type { DebugOverlayProps } from '../debug/types'

interface LoggedEvent {
  seq: number
  event: EngineEvent
}

function statusDotClass(state: string | undefined): string {
  if (state === 'ready') return 'bg-success'
  if (state === 'down') return 'bg-danger'
  if (state === 'starting' || state === 'reconnecting') return 'bg-warning'
  return 'bg-text-muted'
}

function shouldRefresh(event: EngineEvent): boolean {
  return (
    event.type === 'engine.status' ||
    event.type.startsWith('session.') ||
    event.type.startsWith('permission.') ||
    event.type.startsWith('question.')
  )
}

export default function EngineDebug({ open, onOpenChange }: DebugOverlayProps) {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>()
  const [engines, setEngines] = useState<EngineInfo[]>([])
  const [events, setEvents] = useState<LoggedEvent[]>([])
  const [selected, setSelected] = useState('')
  const [testText, setTestText] = useState('Reply with exactly: PONG')
  const [status, setStatus] = useState('')
  const seq = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await window.handheld.engine.snapshot()
      setSnapshot(next)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // Initial load; the async refresh only sets state after the snapshot resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    window.handheld.engine
      .list()
      .then(setEngines)
      .catch(() => undefined)
    const off = window.handheld.engine.onEvent(({ event }) => {
      seq.current += 1
      setEvents((prev) => [...prev, { seq: seq.current, event }].slice(-100))
      if (shouldRefresh(event)) void refresh()
    })
    return off
  }, [open, refresh])

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    try {
      setStatus('')
      await action()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const engineId = snapshot?.engineId
  const ref = selected && engineId ? { engineId, sessionId: selected } : undefined

  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      title="Engine debug"
      description="Ctrl+Shift+E toggles. Drives the default engine through the same IPC the UI uses."
    >
      <section className="rounded-card bg-card p-4 text-on-card">
        <div className="flex items-center gap-3">
          <span
            data-testid="engine-debug-status"
            className={`h-3 w-3 rounded-full ${statusDotClass(snapshot?.status.state)}`}
          />
          <span className="font-semibold">{snapshot?.status.state ?? 'unknown'}</span>
          <span className="text-text-muted">{snapshot?.kind ?? '—'}</span>
        </div>
        {snapshot?.status.state === 'ready' ? (
          <p className="mt-2 text-code text-text-muted">
            mode={snapshot.status.mode} version={snapshot.status.version} pid=
            {snapshot.status.pid ?? '—'}
            <br />
            workspace={snapshot.status.workspaceDir}
          </p>
        ) : null}
        {snapshot?.status.state === 'down' ? (
          <p className="mt-2 text-code text-danger">
            {snapshot.status.error}
            {snapshot.status.hint ? ` — ${snapshot.status.hint}` : ''}
          </p>
        ) : null}
        <p className="mt-2 text-code text-text-muted">
          defaultModel=
          {snapshot?.defaultModel
            ? `${snapshot.defaultModel.providerId}/${snapshot.defaultModel.modelId}`
            : '—'}
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-text-muted">capabilities</summary>
          <pre className="mt-2 overflow-auto text-code text-text-muted">
            {JSON.stringify(snapshot?.capabilities ?? {}, null, 2)}
          </pre>
        </details>
      </section>

      {engines.length > 1 ? (
        <section className="rounded-card bg-card p-4 text-on-card">
          <h3 className="text-base font-semibold">Engines</h3>
          <ul className="text-code text-text-muted">
            {engines.map((engine) => (
              <li key={engine.engineId}>
                {engine.engineId} · {engine.kind}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-card bg-card p-4 text-on-card">
        <h3 className="text-base font-semibold">Sessions</h3>
        {snapshot?.sessions.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {snapshot.sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => setSelected(session.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-code ${
                    selected === session.id
                      ? 'bg-surface text-text'
                      : 'text-text-muted hover:bg-surface'
                  }`}
                >
                  {session.runState} · {session.title} · {session.id}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-code text-text-muted">No sessions.</p>
        )}
      </section>

      <section className="rounded-card bg-card p-4 text-on-card">
        <h3 className="text-base font-semibold">Pending requests</h3>
        <p className="text-code text-text-muted">
          permissions: {snapshot?.pendingPermissions.length ?? 0} · questions:{' '}
          {snapshot?.pendingQuestions.length ?? 0}
        </p>
        <pre className="mt-2 overflow-auto text-code text-text-muted">
          {JSON.stringify(
            {
              permissions: snapshot?.pendingPermissions ?? [],
              questions: snapshot?.pendingQuestions ?? [],
            },
            null,
            2,
          )}
        </pre>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() =>
            void run(async () => setSelected((await window.handheld.engine.createSession()).id))
          }
        >
          New session
        </Button>
        <Button
          disabled={!ref}
          onClick={() =>
            void run(async () => {
              if (ref) await window.handheld.engine.prompt(ref, { text: testText })
            })
          }
        >
          Send test text
        </Button>
        <Button
          disabled={!ref}
          onClick={() =>
            void run(async () => {
              if (ref) await window.handheld.engine.abort(ref)
            })
          }
        >
          Abort
        </Button>
        <Button onClick={() => void run(() => window.handheld.engine.restart())}>
          Restart server
        </Button>
      </div>

      <textarea
        className="min-h-20 w-full rounded-md border border-surface-raised bg-card px-3 py-2 text-code text-on-card"
        value={testText}
        onChange={(event) => setTestText(event.target.value)}
      />

      {status ? <p className="text-code text-danger">{status}</p> : null}

      <section className="rounded-card bg-card p-4 text-on-card">
        <h3 className="text-base font-semibold">Recent events ({events.length})</h3>
        {events.length === 0 ? (
          <p className="text-code text-text-muted">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {events
              .slice()
              .reverse()
              .map(({ seq: id, event }) => (
                <li key={id}>
                  <details>
                    <summary className="cursor-pointer text-code text-text-muted">
                      {id} · {event.type}
                    </summary>
                    <pre className="mt-1 overflow-auto text-code text-text-muted">
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
          </ul>
        )}
      </section>
    </Overlay>
  )
}
