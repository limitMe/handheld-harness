import { useId } from 'react'
import { useTranslation } from '../i18n'

/**
 * Gamepad button glyphs for action hints and prompts (spec 12). Face buttons
 * use the gamepad colour convention (A green, B red, X blue, Y yellow) with a
 * filled disc for a press and a ring for a hold. Every other prompt is drawn
 * monochrome in the current text colour, so the icon set inverts with the theme
 * (dark glyphs on the light theme, light glyphs on the dark theme).
 */

export type GamepadGlyphPhase = 'press' | 'hold'

export interface GamepadGlyphProps {
  /** Physical control name, e.g. `A`, `Y`, `LB`, `DpadLeft`. */
  control: string
  phase?: GamepadGlyphPhase
  /** Fill ratio (0..1) of the hold ring; only used for `phase="hold"`. */
  progress?: number
  /** Box size in px. */
  size?: number
  /** Accessible name; falls back to the control label. */
  label?: string
  className?: string
}

const CONTROL_LABELS: Record<string, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LT: 'LT',
  RT: 'RT',
  Back: 'Back',
  Start: 'Start',
  LS: 'LS',
  RS: 'RS',
  DpadUp: '↑',
  DpadDown: '↓',
  DpadLeft: '←',
  DpadRight: '→',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
}

export function controlLabel(control: string): string {
  return CONTROL_LABELS[control] ?? control
}

/** Face buttons have a dedicated hold ring; other controls use a text prompt. */
export function hasFaceGlyph(control: string): boolean {
  return control in FACE_DISC
}

const FACE_DISC: Record<string, string> = {
  A: 'fill-pad-a',
  B: 'fill-pad-b',
  X: 'fill-pad-x',
  Y: 'fill-pad-y',
}

const FACE_RING: Record<string, string> = {
  A: 'text-pad-a',
  B: 'text-pad-b',
  X: 'text-pad-x',
  Y: 'text-pad-y',
}

type DpadDirection = 'up' | 'down' | 'left' | 'right'

const DPAD_DIRECTION: Record<string, DpadDirection> = {
  DpadUp: 'up',
  DpadDown: 'down',
  DpadLeft: 'left',
  DpadRight: 'right',
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
}

const STICK_SIDE: Record<string, string> = { LS: 'L', RS: 'R' }

const RING_RADIUS = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const TEXT_STYLE = {
  textAnchor: 'middle',
  dominantBaseline: 'central',
  fontWeight: 700,
} as const

/** Rounded plus with a knocked-out notch on the active arm. */
const CROSS_PATH = 'M13 3 H19 V13 H29 V19 H19 V29 H13 V19 H3 V13 H13 Z'

const DPAD_NOTCH: Record<DpadDirection, { x: number; y: number; width: number; height: number }> = {
  up: { x: 12, y: 4, width: 8, height: 7 },
  down: { x: 12, y: 21, width: 8, height: 7 },
  left: { x: 4, y: 12, width: 7, height: 8 },
  right: { x: 21, y: 12, width: 7, height: 8 },
}

const SHOULDER_PATH =
  'M4 12 C4 8.7 6.7 6 10 6 H26 C28.8 6 31 8.2 31 11 V19 C31 22.3 28.3 25 25 25 H10 C6.7 25 4 22.3 4 19 Z'

const TRIGGER_PATH =
  'M8 7 C8 4.8 9.6 3 11.8 3 H21.5 C24.6 3 27 5.4 27 8.5 V21 C27 24.3 24.3 27 21 27 H13.5 C10.4 27 8 24.6 8 21.5 Z'

function maskId(prefix: string, raw: string): string {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, '')}`
}

function FaceButton({
  control,
  phase,
  progress,
}: {
  control: string
  phase: GamepadGlyphPhase
  progress: number
}) {
  if (phase === 'hold') {
    return (
      <>
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={FACE_RING[control]}
        />
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          className="text-accent"
        />
        <text x="16" y="16.5" fontSize="16" className="fill-on-card" {...TEXT_STYLE}>
          {control}
        </text>
      </>
    )
  }
  return (
    <>
      <circle cx="16" cy="16" r="15.5" className={FACE_DISC[control]} />
      <text x="16" y="16.5" fontSize="16" className="fill-pad-label" {...TEXT_STYLE}>
        {control}
      </text>
    </>
  )
}

function Dpad({ direction }: { direction: DpadDirection }) {
  const id = maskId('dpad', useId())
  const notch = DPAD_NOTCH[direction]
  return (
    <>
      <mask id={id}>
        <path
          d={CROSS_PATH}
          fill="white"
          stroke="white"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect
          x={notch.x}
          y={notch.y}
          width={notch.width}
          height={notch.height}
          rx="2.5"
          fill="black"
        />
      </mask>
      <path
        d={CROSS_PATH}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        mask={`url(#${id})`}
      />
    </>
  )
}

function Shoulder({ label }: { label: string }) {
  return (
    <>
      <path d={SHOULDER_PATH} fill="currentColor" />
      <text x="17" y="15.5" fontSize="11" className="fill-surface" {...TEXT_STYLE}>
        {label}
      </text>
    </>
  )
}

function Trigger({ side, label }: { side: 'LT' | 'RT'; label: string }) {
  // The trigger leans away from the controller centre, matching the shoulder
  // prompt it stands for while keeping the label upright.
  const tilt = side === 'LT' ? -12 : 12
  return (
    <>
      <path d={TRIGGER_PATH} transform={`rotate(${tilt} 17.5 15)`} fill="currentColor" />
      <text x="17.5" y="15.5" fontSize="11" className="fill-surface" {...TEXT_STYLE}>
        {label}
      </text>
    </>
  )
}

function Stick({ side }: { side: string }) {
  return (
    <>
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
      <text x="16" y="16.5" fontSize="13" className="fill-current" {...TEXT_STYLE}>
        {side}
      </text>
    </>
  )
}

function BackGlyph() {
  const id = maskId('back', useId())
  return (
    <>
      <mask id={id}>
        <rect x="4" y="4" width="15" height="15" rx="3" fill="white" />
        <rect x="10" y="10" width="18" height="18" rx="5" fill="black" />
        <rect x="13" y="13" width="15" height="15" rx="3" fill="white" />
      </mask>
      <rect x="0" y="0" width="32" height="32" fill="currentColor" mask={`url(#${id})`} />
    </>
  )
}

function StartGlyph() {
  return (
    <>
      <rect x="6" y="8" width="20" height="3.5" rx="1.75" fill="currentColor" />
      <rect x="6" y="14.25" width="20" height="3.5" rx="1.75" fill="currentColor" />
      <rect x="6" y="20.5" width="20" height="3.5" rx="1.75" fill="currentColor" />
    </>
  )
}

/** True when `control` has a dedicated glyph rather than a text key-cap. */
export function hasGamepadGlyph(control: string): boolean {
  return (
    control in FACE_DISC ||
    control === 'LB' ||
    control === 'RB' ||
    control === 'LT' ||
    control === 'RT' ||
    control in DPAD_DIRECTION ||
    control in STICK_SIDE ||
    control === 'Back' ||
    control === 'Start'
  )
}

function TextKeyCap({ control, size }: { control: string; size: number }) {
  return (
    <span
      className="inline-flex min-w-8 items-center justify-center rounded border border-surface-raised bg-card px-1 font-semibold text-on-card"
      style={{ height: size, fontSize: Math.round(size * 0.44) }}
    >
      {controlLabel(control)}
    </span>
  )
}

/** Hold prompt for controls without a hold ring: the word "hold" + the label. */
function HoldKeyCap({ control, size }: { control: string; size: number }) {
  const { t } = useTranslation()
  return (
    <span
      className="inline-flex items-center justify-center gap-1 rounded border border-surface-raised bg-card px-1.5 font-semibold text-on-card"
      style={{ height: size, fontSize: Math.round(size * 0.44) }}
    >
      <span className="text-text-muted">{t('part.hold')}</span>
      <span>{controlLabel(control)}</span>
    </span>
  )
}

export function GamepadGlyph({
  control,
  phase = 'press',
  progress = 0,
  size = 32,
  label,
  className,
}: GamepadGlyphProps) {
  const accessibleName = label ?? controlLabel(control)
  if (!hasGamepadGlyph(control)) {
    return <TextKeyCap control={control} size={size} />
  }
  if (phase === 'hold' && !hasFaceGlyph(control)) {
    return <HoldKeyCap control={control} size={size} />
  }
  const holding = phase === 'hold'
  const isFace = control in FACE_DISC
  return (
    <span
      data-control={control}
      data-phase={phase}
      role="img"
      aria-label={accessibleName}
      {...(holding ? { 'data-testid': 'hold-ring', 'data-holding': progress > 0 || undefined } : {})}
      className={['relative inline-flex shrink-0 items-center justify-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        aria-hidden="true"
        className="font-sans"
      >
        {isFace ? (
          <FaceButton control={control} phase={phase} progress={progress} />
        ) : control === 'LB' || control === 'RB' ? (
          <Shoulder label={control} />
        ) : control === 'LT' || control === 'RT' ? (
          <Trigger side={control} label={control} />
        ) : control in DPAD_DIRECTION ? (
          <Dpad direction={DPAD_DIRECTION[control]!} />
        ) : control in STICK_SIDE ? (
          <Stick side={STICK_SIDE[control]!} />
        ) : control === 'Back' ? (
          <BackGlyph />
        ) : (
          <StartGlyph />
        )}
      </svg>
    </span>
  )
}
