import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Server modules import "server-only" as a bundler guard; tests run them directly.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only.ts"),
    },
  },
  test: { env: { SCHOOL_TZ: "America/New_York" }, exclude: ["**/node_modules/**", ".next/**"] },
});
