import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    rollupOptions: {
      external: [/^\/classic\//],
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3847",
      "/docs-pdf": "http://localhost:3847",
      "/docs-art": "http://localhost:3847",
      "/docs-md": "http://localhost:3847",
    },
  },
});
