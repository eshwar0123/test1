import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import autoprefixer from 'autoprefixer'

export default defineConfig(() => {
  return {
    base: '/',

    build: {
      outDir: 'build',
      assetsDir: 'onix-assets',
    },

    worker: {
      format: 'es',
    },

    css: {
      postcss: {
        plugins: [
          autoprefixer({}),
        ],
      },
    },

    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
    },

    optimizeDeps: {
      force: true,
      exclude: [
        '@cornerstonejs/dicom-image-loader',
        '@cornerstonejs/codec-libjpeg-turbo-8bit',
        '@cornerstonejs/codec-openjpeg',
        '@cornerstonejs/codec-charls',
        '@cornerstonejs/codec-openjph',
        'spark-md5',
        'loglevel',
        'xmlbuilder2',
        'lodash.get',
      ],
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },

    plugins: [react()],

    resolve: {
      alias: [
        { find: 'src/', replacement: `${path.resolve(__dirname, 'src')}/` },
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        { find: 'globalthis', replacement: path.resolve(__dirname, 'src/shims/globalthis.js') },
        { find: 'fast-deep-equal', replacement: path.resolve(__dirname, 'src/shims/fast-deep-equal.js') },
        { find: 'seedrandom', replacement: path.resolve(__dirname, 'src/shims/seedrandom.js') },
        { find: 'spark-md5', replacement: path.resolve(__dirname, 'src/shims/spark-md5.js') },
        { find: 'loglevel', replacement: path.resolve(__dirname, 'src/shims/loglevel.js') },
        { find: 'xmlbuilder2', replacement: path.resolve(__dirname, 'src/shims/xmlbuilder2.js') },
        { find: 'lodash.get', replacement: path.resolve(__dirname, 'src/shims/lodash.get.js') },
        {
          find: '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
          replacement: path.resolve(__dirname, 'src/shims/cornerstone-libjpeg-decodewasmjs.js'),
        },
        {
          find: '@cornerstonejs/codec-charls/decodewasmjs',
          replacement: path.resolve(__dirname, 'src/shims/cornerstone-charls-decodewasmjs.js'),
        },
        {
          find: '@cornerstonejs/codec-openjpeg/decodewasmjs',
          replacement: path.resolve(__dirname, 'src/shims/cornerstone-openjpeg-decodewasmjs.js'),
        },
        {
          find: '@cornerstonejs/codec-openjph/wasmjs',
          replacement: path.resolve(__dirname, 'src/shims/cornerstone-openjph-wasmjs.js'),
        },
        {
          find: '@cornerstonejs/codec-openjph/dist/openjphjs.js',
          replacement: path.resolve(__dirname, 'src/shims/cornerstone-openjph-openjphjs.js'),
        },
        {
          find: '/node_modules/@cornerstonejs/codec-openjph/dist/openjphjs.js',
          replacement: path.resolve(__dirname, 'src/shims/cornerstone-openjph-openjphjs.js'),
        },
      ],

      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss'],
    },

    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: [
        'onixai.in',
        'www.onixai.in',
        '13.216.87.214',
        'localhost',
      ],
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8100',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/radiology': {
          target: 'http://127.0.0.1:8100',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:8100',
          changeOrigin: true,
        },
      },
    },
  }
})
