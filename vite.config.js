import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                entry: 'src/main/index.ts',
                onstart: function (options) {
                    options.startup();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron/main',
                        rollupOptions: {
                            output: {
                                banner: 'import { fileURLToPath as __sf_fileURLToPath } from "node:url"; import __sf_path from "node:path"; const __filename = __sf_fileURLToPath(import.meta.url); const __dirname = __sf_path.dirname(__filename);'
                            },
                            external: ['electron', '@prisma/client', 'fastify', 'ws', 'ssh2', 'dockerode']
                        }
                    }
                }
            },
            {
                onstart: function (options) {
                    options.reload();
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
        rollupOptions: {
            output: {
                manualChunks: {
                    // React 核心库
                    'react-vendor': ['react', 'react-dom'],
                    // 路由库
                    'router': ['react-router-dom'],
                    // 国际化库
                    'i18n': ['i18next', 'react-i18next', 'i18next-http-backend'],
                    // 拖拽库
                    'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']
                }
            }
        },
        chunkSizeWarningLimit: 600
    }
});
