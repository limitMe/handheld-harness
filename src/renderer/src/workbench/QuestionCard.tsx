import { useState } from 'react'
import type { QuestionRequest } from '@shared/engine'
import { FOCUS_ORDER } from '../focus'
import { FocusableButton } from './FocusableButton'

export interface QuestionCardProps {
  request: QuestionRequest
  onReply: (answers: string[][]) => void
  onReject: () => void
}

function OptionButton({
  id,
  order,
  label,
  description,
  selected,
  onToggle,
}: {
  id: string
  order: number
  label: string
  description?: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <FocusableButton
      focusId={id}
      order={order}
      onActivate={onToggle}
      className={`min-h-11 justify-start ${selected ? 'border-accent text-accent' : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <span className="text-text-muted">{selected ? '◉' : '○'}</span>
      <span className="flex flex-col items-start">
        <span>{label}</span>
        {description ? (
          <span className="text-code font-normal text-text-muted">{description}</span>
        ) : null}
      </span>
    </FocusableButton>
  )
}

export function QuestionCard({ request, onReply, onReject }: QuestionCardProps) {
  const [selections, setSelections] = useState<string[][]>(() => request.questions.map(() => []))

  const toggle = (questionIndex: number, label: string, multiple: boolean): void => {
    setSelections((current) => {
      const next = current.map((value) => [...value])
      const selected = next[questionIndex] ?? []
      if (multiple) {
        next[questionIndex] = selected.includes(label)
          ? selected.filter((value) => value !== label)
          : [...selected, label]
      } else {
        next[questionIndex] = selected.includes(label) ? [] : [label]
      }
      return next
    })
  }

  const canSubmit = selections.every((value) => value.length > 0)

  return (
    <div
      data-testid="question-card"
      className="flex flex-col gap-4 rounded-card border border-accent bg-card p-4 text-on-card"
    >
      {request.questions.map((question, questionIndex) => (
        <div key={question.question} className="flex flex-col gap-2">
          {question.header ? (
            <span className="text-code text-text-muted">{question.header}</span>
          ) : null}
          <p className="font-semibold">{question.question}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((option, optionIndex) => {
              const selected = (selections[questionIndex] ?? []).includes(option.label)
              const id = `question-${request.id}-${questionIndex}-${option.label}`
              return (
                <OptionButton
                  key={option.label}
                  id={id}
                  order={FOCUS_ORDER.cards + questionIndex * 10 + optionIndex + 1}
                  label={option.label}
                  description={option.description}
                  selected={selected}
                  onToggle={() => toggle(questionIndex, option.label, question.multiple === true)}
                />
              )
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <FocusableButton
          focusId={`question-${request.id}-submit`}
          order={FOCUS_ORDER.cards + 100}
          onActivate={() => {
            if (canSubmit) onReply(selections)
          }}
          data-testid="question-submit"
          className="min-h-11"
          disabled={!canSubmit}
          onClick={() => onReply(selections)}
        >
          Submit
        </FocusableButton>
        <FocusableButton
          focusId={`question-${request.id}-reject`}
          order={FOCUS_ORDER.cards + 101}
          onActivate={onReject}
          data-testid="question-reject"
          className="min-h-11"
          onClick={onReject}
        >
          Ignore
        </FocusableButton>
      </div>
    </div>
  )
}
