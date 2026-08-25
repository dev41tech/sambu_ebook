import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Duas entradas: o app de produção de ebooks (index) e a vitrine (loja),
      // separadas para que o CSS global do Sambu não vaze para o resto do app.
      input: {
        index: resolve(__dirname, "index.html"),
        loja: resolve(__dirname, "loja.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
