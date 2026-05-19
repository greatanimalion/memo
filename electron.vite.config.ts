import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import optimizer from 'vite-plugin-optimizer'
import { getReplacer } from './plugins/devPlugin'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        include: ['big-library', 'better-sqlite3']
      },
      sourcemap: false
    },
  },
  preload: {
    build:{
      sourcemap: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build:{
      sourcemap: false
    },
    plugins: [react(), tailwindcss(), optimizer(getReplacer())]
  }
})
