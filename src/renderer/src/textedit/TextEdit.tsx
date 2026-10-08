import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dictation, useDictationStore, type DictationTarget } from '../dictation'
import { FocusContainer, useFocusTree, useFocusable } from '../focus'
import { useTranslation } from '../i18n'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { cn } from '../ui'
import { deleteBackward } from '../workbench/textEditing'
import { geometricNeighbor, sentenceIndexAt, splitSentences, type MoveDirection } from './sentences'
import { useTextEditStore } from './store'

export interface TextEditOverlayProps {
  /** Writes the confirmed text back into the composer draft (spec 17: exit commits). */
  onCommit: (text: string) => void
}

const SENTENCE_PREFIX = 'text-edit-sentence-'

function sentenceId(index: number): string {
  return `${SENTENCE_PREFIX}${index}`
}

/**
 * Full-screen sentence editor over the current work (spec 17). Opens with the
 * composer text, lets the D-pad pick sentences, X delete one and long-press Y
 * dictate after the focused one; B exits and commits the result back.
 */
export function TextEditOverlay({ onCommit }: TextEditOverlayProps) {
  const open = useTextEditStore((state) => state.open)
  const source = useTextEditStore((state) => state.source)
  const caret = useTextEditStore((state) => state.caret)
  if (!open) return null
  return (
    <FocusContainer id="text-edit-scope" scope detached>
      <TextEditBody source={source} caret={caret} onCommit={onCommit} />
    </FocusContainer>
  )
}

interface TextEditBindingsProps {
  onLeft: () => void
  onRight: () => void
  onUp: () => void
  onDown: () => void
  onDeleteBackward: () => void
  onActivate: () => void
  onDeactivate: () => void
}

/** Sentence bindings live in a child so the ref-reading callbacks stay out of hooks. */
function TextEditBindings({
  onLeft,
  onRight,
  onUp,
  onDown,
  onDeleteBackward,
  onActivate,
  onDeactivate,
}: TextEditBindingsProps) {
  useInputContext(
    'textEdit',
    {
      'nav.left': onPress(() => onLeft()),
      'nav.right': onPress(() => onRight()),
      'nav.up': onPress(() => onUp()),
      'nav.down': onPress(() => onDown()),
      'input.deleteBackward': onPress(() => onDeleteBackward()),
      'nav.activate': onPress(() => onActivate()),
      'nav.deactivate': onPress(() => onDeactivate()),
    },
    CONTEXT_ORDER.overlay,
  )
  return null
}

interface TextEditBodyProps {
  source: string
  caret: number
  onCommit: (text: string) => void
}

function TextEditBody({ source, caret, onCommit }: TextEditBodyProps) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const dictationStatus = useDictationStore((state) => state.status)
  const dictationLevel = useDictationStore((state) => state.level)

  const initialSentences = useMemo(() => splitSentences(source), [source])
  const initialIndex = sentenceIndexAt(initialSentences, source.length, caret)
  const initialCaret = initialSentences[initialIndex]?.end ?? 0

  const [text, setText] = useState(source)
  const [focusedIndex, setFocusedIndex] = useState(initialIndex)
  const [selection, setSelection] = useState({ start: initialCaret, end: initialCaret })
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const sentences = useMemo(() => splitSentences(text), [text])

  // Dictation reads the live field off refs; the handlers below stay on state so
  // no ref is captured by the input context.
  const textRef = useRef(text)
  const selectionRef = useRef(selection)
  useEffect(() => {
    textRef.current = text
  }, [text])
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const moveTo = (index: number): void => {
    const clamped = Math.max(0, Math.min(sentences.length - 1, index))
    const end = sentences[clamped]?.end ?? 0
    setFocusedIndex(clamped)
    setSelection({ start: end, end })
  }

  const move = (direction: MoveDirection): void => {
    if (editing || !tree) return
    const rects = sentences.map((_, index) => {
      const element = tree.getElement(sentenceId(index)) as HTMLElement | null
      return element ? element.getBoundingClientRect() : null
    })
    moveTo(geometricNeighbor(rects, focusedIndex, direction))
  }

  const deleteBackwardAtCaret = (): void => {
    if (editing || dictation.active) return
    const caret = selection.start
    const next = deleteBackward(text, caret, caret)
    if (next.value === text) return
    const nextList = splitSentences(next.value)
    const index = sentenceIndexAt(nextList, next.value.length, next.position)
    setText(next.value)
    setFocusedIndex(index)
    setSelection({ start: next.position, end: next.position })
  }

  const exit = (): void => {
    if (dictation.active) dictation.finish()
    onCommit(textRef.current)
    useTextEditStore.getState().close()
  }

  const beginEdit = (): void => {
    if (editing) return
    setEditValue(sentences[focusedIndex]?.text ?? '')
    setEditing(true)
  }

  const commitSentenceEdit = (): void => {
    const sentence = sentences[focusedIndex]
    setEditing(false)
    if (!sentence) return
    const nextText = text.slice(0, sentence.start) + editValue + text.slice(sentence.end)
    const nextList = splitSentences(nextText)
    const index = sentenceIndexAt(nextList, nextText.length, sentence.start + editValue.length)
    const end = nextList[index]?.end ?? 0
    setText(nextText)
    setFocusedIndex(index)
    setSelection({ start: end, end })
  }

  // Dictation writes the whole text through this adapter; the caret stays at the
  // end of the focused sentence so new speech is inserted after it (P-07).
  const dictationTarget = useMemo<DictationTarget>(
    () => ({
      getValue: () => textRef.current,
      getSelection: () => selectionRef.current,
      apply: (result) => {
        const list = splitSentences(result.value)
        const index = sentenceIndexAt(list, result.value.length, result.selectionStart)
        textRef.current = result.value
        selectionRef.current = { start: result.selectionStart, end: result.selectionEnd }
        setText(result.value)
        setFocusedIndex(index)
        setSelection({ start: result.selectionStart, end: result.selectionEnd })
      },
      activate: () => undefined,
      isActivated: () => true,
      isAlive: () => true,
    }),
    [],
  )

  useEffect(() => {
    if (editing) {
      dictation.registerTarget(null, 'textEdit')
      return undefined
    }
    dictation.registerTarget(dictationTarget, 'textEdit')
    return () => dictation.registerTarget(null, 'textEdit')
  }, [editing, dictationTarget])

  // Keep the focus tree on the selected sentence so hints anchor to it. The
  // modal scope pushes focus onto its first child during mount, which happens
  // after this effect; re-assert on the microtask queue (as the task map does).
  const focusToken = useRef(0)
  useEffect(() => {
    if (!tree) return
    const id = sentenceId(focusedIndex)
    const token = ++focusToken.current
    const apply = (): void => {
      tree.setFocus(id)
      tree.activate(id)
    }
    apply()
    queueMicrotask(() => {
      if (focusToken.current === token) apply()
    })
    return () => {
      focusToken.current += 1
    }
  }, [tree, focusedIndex, sentences.length])

  // Render the original text with each sentence wrapped in place, so prose
  // flows line by line and only real newlines break (spec 17 feedback).
  const content: ReactNode[] = []
  let cursor = 0
  sentences.forEach((sentence, index) => {
    if (sentence.start > cursor) content.push(text.slice(cursor, sentence.start))
    content.push(
      <SentenceItem
        key={index}
        id={sentenceId(index)}
        order={index}
        text={sentence.text}
        placeholder={t('textEdit.empty')}
        focused={index === focusedIndex}
        editing={editing && index === focusedIndex}
        editValue={editValue}
        onEditChange={setEditValue}
        onEditCommit={commitSentenceEdit}
        onEditCancel={() => setEditing(false)}
        onSelect={() => moveTo(index)}
      />,
    )
    cursor = sentence.end
  })
  if (cursor < text.length) content.push(text.slice(cursor))

  return (
    <div
      data-testid="text-edit"
      className="absolute inset-0 z-40 flex flex-col bg-surface/70 backdrop-blur-sm"
    >
      <div className="scrollbar-hidden flex flex-1 flex-col justify-end overflow-y-auto px-6 pt-6 pb-2 sm:px-10">
        <p className="mx-auto w-full max-w-3xl whitespace-pre-wrap text-2xl leading-relaxed text-text">
          {content}
        </p>
      </div>
      <MicIndicator
        status={dictationStatus}
        level={dictationLevel}
        activeLabel={t('textEdit.listening')}
        idleLabel={t('textEdit.holdToSpeak')}
      />
      <TextEditBindings
        onLeft={() => move('left')}
        onRight={() => move('right')}
        onUp={() => move('up')}
        onDown={() => move('down')}
        onDeleteBackward={deleteBackwardAtCaret}
        onActivate={beginEdit}
        onDeactivate={() => {
          if (editing) setEditing(false)
          else exit()
        }}
      />
    </div>
  )
}

interface SentenceItemProps {
  id: string
  order: number
  text: string
  placeholder: string
  focused: boolean
  editing: boolean
  editValue: string
  onEditChange: (value: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onSelect: () => void
}

function SentenceItem({
  id,
  order,
  text,
  placeholder,
  focused,
  editing,
  editValue,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onSelect,
}: SentenceItemProps) {
  const elementRef = useRef<HTMLSpanElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Selection is driven by the parent's focused index; clicks report back so a
  // mouse pick moves the highlight without fighting the modal scope (spec 17).
  const focus = useFocusable({ id, elementRef, order, activatable: true })

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  return (
    <span
      ref={elementRef}
      {...focus.props}
      onClick={onSelect}
      data-testid="text-edit-sentence"
      data-text-sentence=""
      data-index={order}
      className={cn(
        'rounded-sm px-0.5 transition-colors duration-fast ease-standard [box-decoration-break:clone]',
        editing && 'block',
        focused ? 'bg-surface-raised text-text' : '',
      )}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          data-testid="text-edit-input"
          value={editValue}
          rows={1}
          onChange={(event) => onEditChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onEditCancel()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              if (event.nativeEvent.isComposing) return
              event.preventDefault()
              onEditCommit()
            }
          }}
          className="my-1 block w-full resize-none rounded-card border border-surface-raised bg-card px-3 py-2 text-2xl text-text outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      ) : (
        <>
          {text.length > 0 ? text : <span className="italic text-text-muted">{placeholder}</span>}
          {focused ? (
            <span
              data-testid="text-edit-caret"
              className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-accent align-[-0.15em]"
            />
          ) : null}
        </>
      )}
    </span>
  )
}

function MicIndicator({
  status,
  level,
  activeLabel,
  idleLabel,
}: {
  status: string
  level: number
  activeLabel: string
  idleLabel: string
}) {
  const active = status !== 'idle'
  return (
    <div
      data-testid="text-edit-mic"
      data-active={active ? '' : undefined}
      className="flex shrink-0 flex-col items-center gap-2 pt-4 pb-[20vh]"
    >
      <span
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors duration-fast ease-standard',
          active
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-surface-raised bg-surface-raised text-text-muted',
        )}
      >
        <MicGlyph />
      </span>
      <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-raised">
        <span
          className="block h-full bg-accent transition-[width] duration-fast"
          style={{ width: `${Math.round((active ? level : 0) * 100)}%` }}
        />
      </span>
      <span className="text-sm text-text-muted">{active ? activeLabel : idleLabel}</span>
    </div>
  )
}

function MicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={28}
      height={28}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}
