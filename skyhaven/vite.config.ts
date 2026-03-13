import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Must match src-tauri/tauri.conf.json build.devUrl (default 5173).
  // If 5173 is taken, Tauri still loads 5173 and the window stays blank.
  server: {
    port: 5173,
    strictPort: true,
  },
});
