/** The four button-feedback cues. Only the ones with a bundled clip play. */
export type SoundName = 'delete' | 'select' | 'back' | 'scroll'

/**
 * Bundled clips under `assets/audio/<name>.ogg`. Resolved through `import.meta.glob`
 * so a cue without an audio file yet is simply silent, and dropping a matching
 * `<name>.ogg` in enables it with no code change.
 */
const CLIPS = import.meta.glob('../assets/audio/*.ogg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function clipsByName(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, url] of Object.entries(CLIPS)) {
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.ogg$/, '')
    out[name] = url
  }
  return out
}

const SOURCES = clipsByName()

/** Playback level; the clips are pre-mastered, this just keeps them unobtrusive. */
const VOLUME = 0.6

/**
 * Plays the short UI clips bundled under `assets/audio`. Uses `HTMLAudioElement`
 * so it works from both the dev http server and the packaged `file://` renderer,
 * and clones per play so rapid repeats (scroll, delete) can overlap.
 */
export class SoundPlayer {
  private templates = new Map<SoundName, HTMLAudioElement>()
  enabled = false

  /** Warms the clips so the first press is not silent. Safe to call repeatedly. */
  preload(): void {
    if (this.templates.size > 0 || typeof Audio === 'undefined') return
    for (const [name, url] of Object.entries(SOURCES) as [SoundName, string][]) {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = VOLUME
      this.templates.set(name, audio)
    }
  }

  /** Silently ignores a cue whose clip is not bundled yet. */
  play(name: SoundName): void {
    if (!this.enabled) return
    this.preload()
    const template = this.templates.get(name)
    if (!template) return
    const node = template.cloneNode(true) as HTMLAudioElement
    node.volume = VOLUME
    void node.play().catch(() => undefined)
  }
}

export const soundPlayer = new SoundPlayer()
