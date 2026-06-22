import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Fixa a raiz do projeto explicitamente — sem isso, um lockfile perdido em uma pasta
  // pai (ex.: package-lock.json acidental) faz o Next inferir a raiz errada e o build
  // standalone sai aninhado (.next/standalone/bigdata_ofertas/server.js em vez de
  // .next/standalone/server.js), quebrando o CMD do Dockerfile.
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
