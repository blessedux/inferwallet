import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@inferwallet/sdk": path.resolve(__dirname, "../sdk/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
