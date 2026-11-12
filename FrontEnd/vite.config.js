import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Versión de la web por deploy: la de package.json, el número de build (commits de la rama),
// el commit y la fecha de compilación. Cada deploy recompila, así que cambia sola.
const git = (comando) => {
  try {
    return execSync(`git ${comando}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_BUILD': JSON.stringify(git('rev-list --count HEAD')),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
