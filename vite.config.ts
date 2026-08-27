import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              output: {
                banner: 'import { fileURLToPath as __sf_fileURLToPath } from "node:url"; import __sf_path from "node:path"; const __filename = __sf_fileURLToPath(import.meta.url); const __dirname = __sf_path.dirname(__filename);'
              },
              external: (id: string) =>
                id.includes('prisma/generated/client') ||
                ['electron', '@prisma/client', 'fastify', 'ws', 'ssh2', 'dockerode'].includes(id)
            }
          }
        }
      },
      {
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              input: 'src/preload/index.ts',
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                entryFileNames: 'index.cjs',
                chunkFileNames: '[name].cjs',
                assetFileNames: '[name].[ext]'
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  define: {
    'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production')
  },
  build: {
    // 启用更细粒度的代码分割
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          // React 核心库
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
          // 路由库
          if (id.includes('node_modules/react-router')) {
            return 'router'
          }
          // 国际化库（较大，按需加载）
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'i18n'
          }
          // 拖拽库
          if (id.includes('node_modules/@dnd-kit')) {
            return 'dnd'
          }
          // Prisma 客户端（主进程）
          if (id.includes('@prisma/client')) {
            return 'prisma'
          }
          // Fastify 及插件（主进程）
          if (id.includes('node_modules/fastify') || id.includes('node_modules/@fastify')) {
            return 'fastify'
          }
          // UUID 工具
          if (id.includes('node_modules/uuid')) {
            return 'utils'
          }
          // 其他 node_modules
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  // 开发环境优化
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'i18next', 'react-i18next']
  },
  // 生产环境构建优化
  // 使用 Vite 默认的 esbuild 压缩（比 terser 更快）
  minify: 'esbuild',
})
