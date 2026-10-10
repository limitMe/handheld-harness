import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QuestionRequest } from '@shared/engine'
import { useFocusable, FOCUS_ORDER } from '../focus'
import { useScrollHighlighted } from '../hooks/useScrollHighlighted'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { useTranslation } from '../i18n'
import { Button, cn } from '../ui'
import { isPointerMoved } from './hover'

export interface QuestionCardProps {
  request: QuestionRequest
  /** When false the card is behind a higher overlay and must not consume input. */
  interactive?: boolean
  onReply: (answers: string[][]) => void
  onReject: () => void
}

type QuestionTarget =
  { kind: 'option'; questionIndex: number; label: string } | { kind: 'submit' } | { kind: 'ignore' }

/**
 * Question prompt. The card itself is the activated focus node and owns a
 * D-pad highlight over options + submit + ignore (spec 13, P-13): A selects
 * (multi-select toggles), B ignores. Buttons stay for touch and keyboard.
 */
export function QuestionCard({
  request,
  interactive = true,
  onReply,
  onReject,
}: QuestionCardProps) {
  const { t } = useTranslation()
  const cardRef = useRef<HTMLDivElement>(null)
  const [selections, setSelections] = useState<string[][]>(() => request.questions.map(() => []))
  const [highlight, setHighlight] = useState(0)

  const targets = useMemo<QuestionTarget[]>(() => {
    const list: QuestionTarget[] = []
    request.questions.forEach((question, questionIndex) => {
      question.options.forEach((option) => {
        list.push({ kind: 'option', questionIndex, label: option.label })
      })
    })
    list.push({ kind: 'submit' })
    list.push({ kind: 'ignore' })
    return list
  }, [request])

  const optionIndex = useMemo(() => {
    const map = new Map<string, number>()
    targets.forEach((target, index) => {
      if (target.kind === 'option') map.set(`${target.questionIndex}:${target.label}`, index)
    })
    return map
  }, [targets])

  const active = Math.min(highlight, Math.max(0, targets.length - 1))
  const canSubmit = selections.every((value) => value.length > 0)

  // The question owns its highlight instead of registering each option with the
  // focus tree, so it must scroll the highlighted option into view itself.
  useScrollHighlighted(cardRef, active)

  // The question prompt above the first option is not a highlight target, so
  // scrolling to the option alone leaves the prompt off-screen when the first
  // option is reached. Pull the whole question block into view in that case.
  useEffect(() => {
    const target = targets[active]
    if (target?.kind !== 'option') return
    const question = request.questions[target.questionIndex]
    if (question?.options[0]?.label !== target.label) return
    cardRef.current
      ?.querySelector<HTMLElement>(`[data-question-group="${target.questionIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [active, targets, request])

  const selectOption = useCallback(
    (questionIndex: number, label: string, multiple: boolean) => {
      const next = selections.map((value) => [...value])
      const selected = next[questionIndex] ?? []
      if (multiple) {
        next[questionIndex] = selected.includes(label)
          ? selected.filter((value) => value !== label)
          : [...selected, label]
      } else {
        next[questionIndex] = [label]
      }
      setSelections(next)
      // Selecting never submits. Once every question has an answer, nudge the
      // highlight onto Submit so A confirms, but the user can still move back up
      // and revise before pressing it. Multi-select waits for Submit explicitly.
      if (!multiple && next.every((value) => value.length > 0)) {
        setHighlight(targets.length - 2)
      }
    },
    [selections, targets.length],
  )

  const confirm = useCallback(() => {
    const target = targets[active]
    if (!target) return
    if (target.kind === 'ignore') {
      onReject()
      return
    }
    if (target.kind === 'submit') {
      if (canSubmit) onReply(selections)
      return
    }
    const question = request.questions[target.questionIndex]
    selectOption(target.questionIndex, target.label, question?.multiple === true)
  }, [targets, active, canSubmit, selections, request, selectOption, onReply, onReject])

  useInputContext(
    'currentWork.question',
    {
      'nav.up': onPress(() => setHighlight((index) => Math.max(index - 1, 0))),
      'nav.down': onPress(() => setHighlight((index) => Math.min(index + 1, targets.length - 1))),
      'question.confirm': onPress(confirm),
      'question.ignore': onPress(onReject),
    },
    CONTEXT_ORDER.overlay,
    interactive,
  )

  const focus = useFocusable({
    id: `question-${request.id}`,
    elementRef: cardRef,
    order: FOCUS_ORDER.cards,
    activatable: true,
  })

  const highlightClass = 'border-accent text-accent'

  return (
    <div
      ref={cardRef}
      {...focus.props}
      data-testid="question-card"
      className="flex flex-col gap-4 rounded-card border border-accent bg-card p-4 text-on-card"
    >
      {request.questions.map((question, questionIndex) => (
        <div
          key={question.question}
          data-question-group={questionIndex}
          className="flex flex-col gap-2"
        >
          {question.header ? (
            <span className="text-code text-text-muted">{question.header}</span>
          ) : null}
          <p className="font-semibold">{question.question}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((option) => {
              const selected = (selections[questionIndex] ?? []).includes(option.label)
              const index = optionIndex.get(`${questionIndex}:${option.label}`) ?? -1
              return (
                <Button
                  key={option.label}
                  data-testid={`question-option-${questionIndex}-${option.label}`}
                  data-highlighted={index === active ? '' : undefined}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-11 justify-start',
                    selected ? highlightClass : '',
                    index === active ? 'ring-2 ring-focus-ring' : '',
                  )}
                  onMouseMove={(event) => {
                    if (isPointerMoved(event)) setHighlight(index)
                  }}
                  onClick={() =>
                    selectOption(questionIndex, option.label, question.multiple === true)
                  }
                >
                  <span className="text-text-muted">{selected ? '◉' : '○'}</span>
                  <span className="flex flex-col items-start">
                    <span>{option.label}</span>
                    {option.description ? (
                      <span className="text-code font-normal text-text-muted">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          data-testid="question-submit"
          data-highlighted={active === targets.length - 2 ? '' : undefined}
          disabled={!canSubmit}
          className={cn('min-h-11', active === targets.length - 2 ? 'ring-2 ring-focus-ring' : '')}
          onMouseMove={(event) => {
            if (isPointerMoved(event)) setHighlight(targets.length - 2)
          }}
          onClick={() => {
            if (canSubmit) onReply(selections)
          }}
        >
          {t('question.submit')}
        </Button>
        <Button
          data-testid="question-reject"
          data-highlighted={active === targets.length - 1 ? '' : undefined}
          className={cn('min-h-11', active === targets.length - 1 ? 'ring-2 ring-focus-ring' : '')}
          onMouseMove={(event) => {
            if (isPointerMoved(event)) setHighlight(targets.length - 1)
          }}
          onClick={onReject}
        >
          {t('question.ignore')}
        </Button>
      </div>
    </div>
  )
}
