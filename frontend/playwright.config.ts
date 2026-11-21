import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Browser tests against the real Next.js app.
 *
 * There is no wallet extension and no private key here: `e2e/mock-wallet.ts`
 * installs a fake EIP-6963 wallet, so the flows the app owns - picking a wallet,
 * a dismissed prompt, the wrong chain, form validation - can be exercised
 * end to end without signing anything.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" as const }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, not `next dev`. Dev compiles each route on first
    // request and hydrates late, so the first click can land on a button whose
    // handler is not attached yet.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
