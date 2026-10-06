import { useEffect, useState } from 'react'
import StatusBar from './components/StatusBar'
import GamepadDebug from './debug/GamepadDebug'
import MicDebug from './debug/MicDebug'

export default function App() {
  const [gamepadOpen, setGamepadOpen] = useState(false)
  const [micOpen, setMicOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.code === 'KeyG') {
        event.preventDefault()
        setGamepadOpen((open) => !open)
      } else if (event.code === 'KeyM') {
        event.preventDefault()
        setMicOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface text-text">
      <StatusBar title="HANDHELD.AI" />
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-[40rem] text-center">
          <p className="text-xl font-semibold text-text">Scaffold ready</p>
          <p className="mt-2 text-base text-text-muted">
            Ctrl+Shift+G opens the gamepad probe, Ctrl+Shift+M opens the microphone probe.
          </p>
        </div>
      </main>
      <GamepadDebug open={gamepadOpen} onOpenChange={setGamepadOpen} />
      <MicDebug open={micOpen} onOpenChange={setMicOpen} />
    </div>
  )
}
