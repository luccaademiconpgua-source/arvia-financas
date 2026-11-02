import { defineConfig } from "vitest/config";
import { nfcePlugin } from "./server/nfce.js";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), nfcePlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Arvia",
        short_name: "Arvia",
        description: "Finanças pessoais e da empresa em um só lugar.",
        lang: "pt-BR",
        display: "standalone",
        start_url: "/",
        background_color: "#F8FAFC",
        theme_color: "#134E4A",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        importScripts: ["push-sw.js"],
      },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
