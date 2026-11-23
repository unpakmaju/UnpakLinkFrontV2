import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // base: "/asj_rbac/",
  server: {
    host: "127.0.0.1",
    allowedHosts: ["localhost", "127.0.0.1", "unpak.link"],
    proxy: {
      "/realms": {
        target: "https://gerbang.unpak.ac.id",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  esbuild: {
    drop: ["console", "debugger"],
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@assets": path.resolve(__dirname, "src/assets"),
      "@src": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "src"),
    },
  }
})