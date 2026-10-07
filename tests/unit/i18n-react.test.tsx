// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { i18n, useTranslation } from '../../src/renderer/src/i18n'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

function Probe() {
  const { t } = useTranslation()
  return <span data-testid="probe">{t('composer.send')}</span>
}

describe('renderer i18n singleton', () => {
  it('translates through useTranslation without a provider', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('Send')
  })

  it('re-renders when the language changes', async () => {
    render(<Probe />)
    await act(async () => {
      await i18n.changeLanguage('zh')
    })
    expect(screen.getByTestId('probe').textContent).toBe('发送')
  })
})
