import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { createHandheldApi } from './api'

const api = createHandheldApi({
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
})

contextBridge.exposeInMainWorld('handheld', api)
