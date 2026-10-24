// Build-time values injected by electron-vite from MAIN_VITE_* env vars (.env.local or CI).
interface ImportMetaEnv {
  readonly MAIN_VITE_SPOTIFY_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// electron-vite: `?asset` imports copy the file into the build and resolve to its absolute path at runtime.
declare module '*?asset' {
  const path: string
  export default path
}

interface ImportMetaEnv {
  readonly MAIN_VITE_DISCORD_CLIENT_ID?: string
}

interface ImportMetaEnv {
  readonly MAIN_VITE_SUPABASE_URL?: string
  readonly MAIN_VITE_SUPABASE_ANON_KEY?: string
}
