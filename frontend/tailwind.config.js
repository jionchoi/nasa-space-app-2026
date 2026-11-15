/** Theme: v4 (design-handoff/v4/*.dc.html). Colors are CSS variables (src/index.css) so SVG and charts share them.
 *  Use these tokens everywhere; never raw hex in components. One accent (info); status colors carry meaning only. */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        header: token('header'),
        panel: token('panel'),
        map: token('map'),
        inset: token('inset'),
        raised: token('raised'),
        line: token('line'),
        'line-strong': token('line-strong'),
        text: token('text'),
        soft: token('soft'),
        muted: token('muted'),
        // status tokens: Nominal, Watch, Warning, Act now
        ok: token('ok'),
        watch: token('watch'),
        warn: token('warn'),
        alert: token('alert'),
        // primary accent and the EMERGENCY button
        info: token('info'),
        emergency: token('emergency'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', '"Inter Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        panel: '16px',
        card: '12px',
        control: '10px',
      },
      minHeight: {
        touch: '44px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        zone: { '0%, 100%': { opacity: '0.95' }, '50%': { opacity: '0.35' } },
        beat: { '0%': { transform: 'scale(1)' }, '15%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1)' } },
        breathe: { '0%, 100%': { transform: 'scale(0.55)' }, '50%': { transform: 'scale(1)' } },
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        halo: { '0%': { transform: 'scale(1)', opacity: '0.55' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        zone: 'zone 1.4s ease-in-out infinite',
        beat: 'beat 0.5s ease-out',
        breathe: 'breathe 10s ease-in-out infinite',
        rise: 'rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        halo: 'halo 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
      },
    },
  },
  plugins: [],
};
