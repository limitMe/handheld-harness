import { createDictationAudio } from './audio'
import { DictationController } from './controller'
import { pulseGamepad } from './pulse'
import { useDictationStore } from './store'

/** App-wide dictation controller. Text fields register themselves as targets. */
export const dictation = new DictationController({
  speech: () => window.handheld?.speech,
  audio: createDictationAudio({
    onError: (error) => useDictationStore.getState().setError(error.message),
  }),
  setStatus: (status) => useDictationStore.getState().setStatus(status),
  setLevel: (level) => useDictationStore.getState().setLevel(level),
  setError: (error) => useDictationStore.getState().setError(error),
  pulse: pulseGamepad,
})
