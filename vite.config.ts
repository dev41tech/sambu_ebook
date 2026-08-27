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
    // Sem isto o Vite escuta so em [::1] (IPv6). Navegador que resolve
    // "localhost" para 127.0.0.1 primeiro nao conecta em nada.
    host: true,
    proxy: {
      // O alvo precisa ser 127.0.0.1, e nao "localhost": no Node 18+ o
      // localhost pode resolver para ::1 e o proxy erra a pilha do servidor
      // da API, que escuta em IPv4.
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
