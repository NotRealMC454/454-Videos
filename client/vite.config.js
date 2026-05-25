import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFile, readdir, rename, rm } from 'fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))

const routes = ['login', 'account', 'search', 'upload', 'channel', 'changelog', 'video']

export default defineConfig({
  appType: 'custom',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/routes/index.html'),
        ...Object.fromEntries(routes.map(r => [r, resolve(__dirname, `src/routes/${r}.html`)])),
      },
    },
  },
  plugins: [routePlugin(routes)],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})

function routePlugin(routes) {
  return {
    name: 'route-rewrite',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        let page
        if (url === '/' || url === '') {
          page = 'index'
        } else {
          const match = routes.find(r => url === `/${r}` || url === `/${r}/`)
          if (match) page = match
        }
        if (!page) return next()

        try {
          const html = await readFile(resolve(__dirname, `src/routes/${page}.html`), 'utf-8')
          const transformed = await server.transformIndexHtml(req.url, html)
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html')
          res.end(transformed)
        } catch {
          next()
        }
      })
    },
    async closeBundle() {
      const routesDir = resolve(__dirname, 'dist/src/routes')
      const distDir = resolve(__dirname, 'dist')
      try {
        const files = await readdir(routesDir)
        for (const file of files) {
          if (file.endsWith('.html')) {
            await rename(resolve(routesDir, file), resolve(distDir, file))
          }
        }
        await rm(resolve(__dirname, 'dist/src'), { recursive: true, force: true })
      } catch {}
    },
  }
}
