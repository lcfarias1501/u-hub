// Build-time values injected by electron-vite from MAIN_VITE_* env vars (.env.local or CI).
interface ImportMetaEnv {
  readonly MAIN_VITE_SPOTIFY_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
