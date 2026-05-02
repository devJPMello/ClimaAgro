import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

const apiProxy = (target: string) => ({
  '/api': {
    target: target.replace(/\/$/, ''),
    changeOrigin: true,
  },
  '/socket.io': {
    target: target.replace(/\/$/, ''),
    changeOrigin: true,
    ws: true,
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendOrigin = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000').replace(/\/$/, '')

  return {
  server: {
    // Dev: `fetch('/api/...')` → backend (evita CORS). Porta do back: VITE_API_PROXY_TARGET ou 5000.
    proxy: apiProxy(backendOrigin),
  },
  preview: {
    // `vite preview` também precisa do proxy se o front usar base relativa `/api`.
    proxy: apiProxy(backendOrigin),
  },
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
