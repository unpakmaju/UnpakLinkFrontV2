import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
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
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("recharts") ||
            id.includes("react-simple-maps") ||
            id.includes("d3-") ||
            id.includes("topojson") ||
            id.includes("i18n-iso-countries")
          ) {
            return "vendor-charts";
          }
          if (
            id.includes("keycloak-js") ||
            id.includes("@react-keycloak") ||
            id.includes("jwt-decode")
          ) {
            return "vendor-auth";
          }
          if (
            id.includes("sweetalert2") ||
            id.includes("qrcode.react") ||
            id.includes("html-to-image")
          ) {
            return "vendor-tools";
          }
          if (
            id.includes("lucide-react") ||
            id.includes("react-icons") ||
            id.includes("framer-motion")
          ) {
            return "vendor-icons";
          }
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@assets": path.resolve(__dirname, "src/assets"),
      "@src": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
