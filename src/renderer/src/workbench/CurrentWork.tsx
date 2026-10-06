import { useWorkbenchStore } from '../state/store'
import { sessionKey } from '../state/types'
import { Composer } from './Composer'
import { ErrorBanner } from './ErrorBanner'
import { MessageList } from './MessageList'

export function CurrentWork() {
  const current = useWorkbenchStore((state) => state.ui.current)
  const defaultEngineId = useWorkbenchStore((state) => state.defaultEngineId)
  const engineEntry = useWorkbenchStore((state) =>
    defaultEngineId ? state.engines[defaultEngineId] : undefined,
  )
  const sessions = useWorkbenchStore((state) => state.sessions)
  const messages = useWorkbenchStore((state) => state.messages)
  const messagesLoaded = useWorkbenchStore((state) => state.messagesLoaded)
  const pendingPermissions = useWorkbenchStore((state) => state.pendingPermissions)
  const pendingQuestions = useWorkbenchStore((state) => state.pendingQuestions)
  const drafts = useWorkbenchStore((state) => state.ui.drafts)
  const setDraft = useWorkbenchStore((state) => state.setDraft)
  const sendCurrent = useWorkbenchStore((state) => state.sendCurrent)
  const abortCurrent = useWorkbenchStore((state) => state.abortCurrent)
  const replyPermission = useWorkbenchStore((state) => state.replyPermission)
  const replyQuestion = useWorkbenchStore((state) => state.replyQuestion)
  const rejectQuestion = useWorkbenchStore((state) => state.rejectQuestion)

  const key = current ? sessionKey(current) : 'new-task'
  const draft = drafts[key] ?? ''
  const summary = current ? sessions[key] : undefined
  const busy = summary?.runState === 'busy'
  const sessionMessages = current && messagesLoaded[key] ? (messages[key] ?? []) : []
  const permissions = current ? (pendingPermissions[key] ?? []) : []
  const questions = current ? (pendingQuestions[key] ?? []) : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ErrorBanner status={engineEntry?.status} />
      <MessageList
        messages={sessionMessages}
        permissions={permissions}
        questions={questions}
        capabilities={engineEntry?.capabilities}
        busy={busy}
        inputEmpty={draft.trim().length === 0}
        onReplyPermission={(requestId, reply) => void replyPermission(requestId, reply)}
        onReplyQuestion={(requestId, answers) => void replyQuestion(requestId, answers)}
        onRejectQuestion={(requestId) => void rejectQuestion(requestId)}
      />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void sendCurrent()}
        onAbort={() => void abortCurrent()}
        busy={busy}
        focusKey={key}
        engineId={current?.engineId ?? defaultEngineId}
        commandsAvailable={engineEntry?.capabilities?.commands ?? false}
      />
    </div>
  )
}
