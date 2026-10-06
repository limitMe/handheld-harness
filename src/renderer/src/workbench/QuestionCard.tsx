import { useState } from 'react'
import type { QuestionRequest } from '@shared/engine'
import { Button } from '../ui'

export interface QuestionCardProps {
  request: QuestionRequest
  onReply: (answers: string[][]) => void
  onReject: () => void
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
            {question.options.map((option) => {
              const selected = (selections[questionIndex] ?? []).includes(option.label)
              return (
                <Button
                  key={option.label}
                  className={`min-h-11 justify-start ${selected ? 'border-accent text-accent' : ''}`}
                  aria-pressed={selected}
                  onClick={() => toggle(questionIndex, option.label, question.multiple === true)}
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
          className="min-h-11"
          disabled={!canSubmit}
          onClick={() => onReply(selections)}
        >
          Submit
        </Button>
        <Button data-testid="question-reject" className="min-h-11" onClick={onReject}>
          Ignore
        </Button>
      </div>
    </div>
  )
}
