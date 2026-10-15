import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` で開発するときは backend (localhost:8000) にプロキシする
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/auth": "http://localhost:8000",
    },
  },
});
