import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/dashboard": "http://127.0.0.1:8787",
      "/admin": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
      "/media": "http://127.0.0.1:8787",
    },
  },
});
