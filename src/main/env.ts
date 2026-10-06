/**
 * electron-vite only sets ELECTRON_RENDERER_URL for the dev server, so it is a
 * reliable "development mode" signal for both `npm run dev` and `npm run start`.
 */
export function isDevMode(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL)
}
