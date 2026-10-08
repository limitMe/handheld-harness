import { useRef } from 'react'
import type { AnsweredChoice } from '../state/types'
import { useFocusable } from '../focus'
import { useTranslation, type Translate } from '../i18n'
import { cn } from '../ui'
import { CARD_SCROLL_MARGIN_TOP } from './AgentCard'

function answerText(choice: AnsweredChoice, t: Translate): string {
  if (choice.answer.type === 'permission') {
    switch (choice.answer.reply) {
      case 'once':
        return t('permission.allowOnce')
      case 'always':
        return t('permission.alwaysAllow')
      case 'reject':
        return t('permission.reject')
    }
  }
  if (choice.answer.ignored) return t('question.ignored')
  return choice.answer.answers.flat().join(', ')
}

export interface ChoiceCardProps {
  choice: AnsweredChoice
  order: number
}

/**
 * Right-aligned record of a mid-round confirmation the user answered (spec 13).
 * It splits the agent cards above and below it, mirroring the user's own input.
 */
export function ChoiceCardView({ choice, order }: ChoiceCardProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const focus = useFocusable({
    id: `choice-${choice.id}`,
    elementRef: ref,
    order,
    onFocus: () => ref.current?.scrollIntoView({ block: 'start' }),
  })

  return (
    <div className="flex w-full justify-end">
      <div
        ref={ref}
        {...focus.props}
        data-testid="choice-card"
        data-kind={choice.request.kind}
        style={{ scrollMarginTop: CARD_SCROLL_MARGIN_TOP }}
        className={cn(
          'flex max-w-[min(100%,46rem)] flex-col gap-1 rounded-card px-4 py-3',
          choice.request.kind === 'permission'
            ? 'border border-warning bg-card text-on-card'
            : 'bg-card text-on-card',
        )}
      >
        <span className="text-code opacity-70">{t('choice.youChose')}</span>
        <span className="font-semibold">{answerText(choice, t)}</span>
        {choice.request.title ? (
          <span className="text-code opacity-70">{choice.request.title}</span>
        ) : null}
      </div>
    </div>
  )
}
