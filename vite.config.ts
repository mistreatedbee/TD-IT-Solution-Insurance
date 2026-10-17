import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Build guard: the local-only Security Dashboard demo (src/security/demo/) must never ship.
  // `vite build` fails if VITE_DEMO_MODE=true from any source (process env or an env file).
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    if (env.VITE_DEMO_MODE === 'true') {
      throw new Error(
        'VITE_DEMO_MODE=true is set for a build. The Security Dashboard demo is local-dev only ' +
          '(ADR-0013). Unset it (and delete .env.demo.local via `npm run demo:security:cleanup`).',
      )
    }
  }
  return { plugins: [react()] }
})
