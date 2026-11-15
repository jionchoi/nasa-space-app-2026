// Public demo build (Vercel): VITE_PUBLIC_DEMO=true at build time. No backend exists there, so every API call
// returns the mock JSON at once (no request to a localhost the visitor does not have), and only Demo mode is offered.
export const PUBLIC_DEMO = import.meta.env.VITE_PUBLIC_DEMO === 'true';

/** Shown instead of Measurement / Research mode in the public build. */
export const NEEDS_BACKEND = 'Needs the local backend: see README';
export const README_URL = 'https://github.com/jionchoi/nasa-space-app-2026#readme';
