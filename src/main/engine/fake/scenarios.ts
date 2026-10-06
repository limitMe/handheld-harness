/** Scripted payloads for the fake engine's `/fake` scenarios. */

export function longMarkdown(): string {
  const intro = [
    '# Long streaming reply',
    '',
    'This scenario streams roughly three thousand characters of Markdown so the',
    'renderer can be checked for jank while the user types. Everything below is',
    'generated locally and never leaves the machine.',
    '',
    '## Checklist',
    '',
    '- [x] markdown headings',
    '- [x] a fenced code block',
    '- [x] a table',
    '- [x] enough text to stress the throttled renderer',
    '',
  ].join('\n')

  const code = ['```ts', 'export function sum(values: number[]): number {', '  return values.reduce((total, value) => total + value, 0)', '}', '```', ''].join('\n')

  const paragraph =
    'The quick brown fox jumps over the lazy dog while the renderer coalesces ' +
    'incoming deltas and re-renders Markdown at most every fifty milliseconds. ' +
    'Typing in the composer should stay responsive even as this paragraph grows. '

  const bullets = Array.from(
    { length: 12 },
    (_, index) => `- Item ${index + 1}: ${paragraph}`,
  ).join('\n')

  const table = ['', '| Column A | Column B |', '| --- | --- |', '| alpha | beta |', '| gamma | delta |', ''].join('\n')

  return `${intro}${code}\n${paragraph.repeat(4)}\n\n${bullets}\n${table}End of the long reply.\n`
}

export function manyMessages(count: number): Array<{ role: 'user' | 'assistant'; text: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; text: string }> = []
  for (let index = 0; index < count; index += 1) {
    const role = index % 2 === 0 ? 'user' : 'assistant'
    messages.push({
      role,
      text: `${role === 'user' ? 'Question' : 'Answer'} ${index + 1}: a short line of history for the scroll performance scenario.`,
    })
  }
  return messages
}
