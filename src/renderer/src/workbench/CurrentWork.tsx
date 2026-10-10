import type { ChatMessage, PermissionRequest, QuestionRequest } from '@shared/engine'
import { useWorkbenchStore } from '../state/store'
import { sessionKey, type AnsweredChoice } from '../state/types'
import { cn } from '../ui'
import { Composer } from './Composer'
import { ErrorBanner } from './ErrorBanner'
import { MessageList } from './MessageList'

/**
 * Stable empty lists for the "not loaded / no items" cases. A fresh `[]` on
 * every render would change the transcript's memo inputs and re-run its scroll
 * effects after each render, which can cascade into an update-depth loop.
 */
const NO_MESSAGES: ChatMessage[] = []
const NO_PERMISSIONS: PermissionRequest[] = []
const NO_QUESTIONS: QuestionRequest[] = []
const NO_CHOICES: AnsweredChoice[] = []

export interface CurrentWorkProps {
  /** True while the task map is on top: the transcript recedes and stops taking focus. */
  dimmed?: boolean
}

export function CurrentWork({ dimmed = false }: CurrentWorkProps) {
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
  const answeredChoices = useWorkbenchStore((state) => state.answeredChoices)
  const sessionErrors = useWorkbenchStore((state) => state.sessionErrors)
  const drafts = useWorkbenchStore((state) => state.ui.drafts)
  const openSeq = useWorkbenchStore((state) => state.ui.openSeq)
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
  const sessionMessages =
    current && messagesLoaded[key] ? (messages[key] ?? NO_MESSAGES) : NO_MESSAGES
  const permissions = current ? (pendingPermissions[key] ?? NO_PERMISSIONS) : NO_PERMISSIONS
  const questions = current ? (pendingQuestions[key] ?? NO_QUESTIONS) : NO_QUESTIONS
  const choices = current ? (answeredChoices[key] ?? NO_CHOICES) : NO_CHOICES
  const error = current ? sessionErrors[key] : undefined

  return (
    <div
      className={cn(
        'relative flex flex-1 flex-col overflow-hidden transition-[transform,opacity] duration-scene ease-standard',
        dimmed ? 'scale-[0.98] opacity-40' : '',
      )}
    >
      <ErrorBanner status={engineEntry?.status} />
      <MessageList
        messages={sessionMessages}
        permissions={permissions}
        questions={questions}
        choices={choices}
        capabilities={engineEntry?.capabilities}
        busy={busy}
        error={error}
        interactive={!dimmed}
        viewKey={`${key}:${openSeq}`}
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
        autoActivate={!dimmed}
        engineId={current?.engineId ?? defaultEngineId}
        commandsAvailable={engineEntry?.capabilities?.commands ?? false}
      />
    </div>
  )
}
