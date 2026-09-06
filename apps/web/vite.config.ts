import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = {
  target: "http://127.0.0.1:8787",
  timeout: 15_000,
  proxyTimeout: 15_000,
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": api,
      "/dashboard": api,
      "/admin": api,
      "/health": api,
      "/media": api,
    },
  },
});
