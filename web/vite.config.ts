import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      srcDir: "src",
      strategies: "generateSW",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "CCST Ticketing · ProCloud",
        short_name: "CCST",
        description: "Classroom help desk for CCST IT Support",
        theme_color: "#07131f",
        background_color: "#07131f",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => {
              return request.destination === "script" || request.destination === "style";
            },
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-resources",
              expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ request }: { request: Request }) => {
              return request.destination === "image";
            },
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }: { request: Request }) => {
              return request.mode === "navigate";
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
