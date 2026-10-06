import { describe, expect, it } from 'vitest'
import { orderCommands, parseSlashCommand } from '../../src/renderer/src/workbench/commands'

describe('parseSlashCommand', () => {
  it('extracts the name and arguments', () => {
    expect(parseSlashCommand('/compact')).toEqual({ name: 'compact', args: '' })
    expect(parseSlashCommand('/compact now please')).toEqual({
      name: 'compact',
      args: 'now please',
    })
    expect(parseSlashCommand('  /Clear  ')).toEqual({ name: 'clear', args: '' })
  })

  it('returns null for plain prompts', () => {
    expect(parseSlashCommand('hello')).toBeNull()
    expect(parseSlashCommand(' / ')).toBeNull()
    expect(parseSlashCommand('/with space')).toEqual({ name: 'with', args: 'space' })
  })
})

describe('orderCommands', () => {
  const commands = [
    { name: 'clear', description: '' },
    { name: 'compact', description: '' },
    { name: 'init', description: '' },
  ]

  it('returns the engine order without history', () => {
    expect(orderCommands(commands, []).map((command) => command.name)).toEqual([
      'clear',
      'compact',
      'init',
    ])
  })

  it('puts recently used commands first while keeping the rest stable', () => {
    expect(orderCommands(commands, ['init', 'compact']).map((command) => command.name)).toEqual([
      'init',
      'compact',
      'clear',
    ])
  })
})
