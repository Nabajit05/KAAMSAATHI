import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Build from an isolated copy so we never touch the .next directory of a dev server running in the project.
const BUILD_DIR = path.join(os.tmpdir(), "haqcheck-e2e-build");
// .env* is excluded on purpose: tests assert the no-credentials (Supabase/Gemini/Sarvam not configured) behaviour.
const SRC = process.cwd();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `mkdir -p "${BUILD_DIR}" && rsync -a --delete --exclude .next --exclude ".env*" --exclude node_modules --exclude tests --exclude test-results "${SRC}/" "${BUILD_DIR}/" && ln -sfn "${SRC}/node_modules" "${BUILD_DIR}/node_modules" && cd "${BUILD_DIR}" && npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    timeout: 300_000,
  },
});
