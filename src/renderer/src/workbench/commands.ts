import type { CommandInfo } from '@shared/engine'

export interface ParsedCommand {
  name: string
  args: string
}

/** Splits `/compact now` into a command name and its arguments (spec 12). */
export function parseSlashCommand(text: string): ParsedCommand | null {
  const match = /^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  const name = match?.[1]
  if (!name) return null
  return { name: name.toLowerCase(), args: (match?.[2] ?? '').trim() }
}

/** Recently used commands first; ties keep the engine's own order. */
export function orderCommands(commands: CommandInfo[], recent: string[]): CommandInfo[] {
  if (recent.length === 0) return [...commands]
  const rank = new Map(recent.map((name, index) => [name, index]))
  return [...commands].sort(
    (a, b) => (rank.get(a.name) ?? Number.POSITIVE_INFINITY) - (rank.get(b.name) ?? Number.POSITIVE_INFINITY),
  )
}
