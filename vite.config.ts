import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": import.meta.dirname + "/src" } },
  build: {
    chunkSizeWarningLimit: 900,
    assetsDir: "assets",
  },
  server: {
    proxy: {
      "/api": { target: process.env.CFSM_HUB || "http://127.0.0.1:8787", changeOrigin: true, ws: true },
      "/flags": { target: process.env.CFSM_HUB || "http://127.0.0.1:8787", changeOrigin: true },
      "/os-icons": { target: process.env.CFSM_HUB || "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
})
