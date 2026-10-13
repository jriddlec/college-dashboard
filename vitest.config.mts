import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { env: { SCHOOL_TZ: "America/New_York" }, exclude: ["**/node_modules/**", ".next/**"] },
});
