/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "true" for the public no-backend build (Vercel). */
  readonly VITE_PUBLIC_DEMO?: string;
}
