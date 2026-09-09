import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
      "@type": resolve("src/types"),
    },
  },
  root: resolve("src/renderer"),
  build: {
    outDir: resolve("dist/renderer"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve("src/renderer/index.html"),
      external: ["electron"],
      output: {
        globals: {
          electron: "window.electron",
        },
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("zustand")) return "vendor-zustand";
            if (id.includes("blocknote") || id.includes("@blocknote")) return "vendor-blocknote";
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) return "vendor-react";
          }
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "replace-electron-imports",
      transform(code, id) {
        if (
          id.includes("src/renderer") &&
          (id.endsWith(".ts") || id.endsWith(".tsx"))
        ) {
          if (code.includes('from "electron"') || code.includes("from 'electron'")) {
            return {
              code: code
                .replace(/import\s*\{[^}]*\}\s*from\s*["']electron["'];?\n?/g, "")
                .replace(/import\s+.*\s+from\s*["']electron["'];?\n?/g, ""),
              map: null,
            };
          }
        }
        return null;
      },
    },
  ],
  optimizeDeps: {
    exclude: ["electron"],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
