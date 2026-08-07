import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@smc/runtime-client': resolve('../../packages/runtime-client-ts/src/index.ts')
      }
    },
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          'crm-bridge-preload': resolve('src/preload/crm-bridge-preload.ts'),
        },
      },
    },
  },
  renderer: {
    // Pin IPv4 loopback. Default `localhost` can bind only [::1] (Node 17+ / Windows),
    // while Electron Chromium often dials 127.0.0.1 → ERR_CONNECTION_REFUSED / blank window.
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [tailwindcss(), react()]
  }
})
