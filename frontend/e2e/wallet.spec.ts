import { expect, test, type Page } from "@playwright/test";
import { SHORT_ADDRESS, installMockWallet } from "./mock-wallet";

const CONNECT = "Connect wallet";
const MOCK_WALLET = /Mock Wallet/;

/** What the fake wallet was asked to do, in order. */
async function walletCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __walletCalls: string[] }).__walletCalls ?? [],
  );
}

/**
 * Open the picker and choose the fake wallet.
 *
 * Clicking before React hydrates looks like a successful click and does nothing,
 * so this retries until the picker actually lists the wallet.
 */
async function connectMockWallet(page: Page): Promise<void> {
  const walletButton = page.getByRole("button", { name: MOCK_WALLET });

  await expect(async () => {
    if (!(await walletButton.isVisible())) {
      await page.getByRole("button", { name: CONNECT }).click();
    }
    await expect(walletButton).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await walletButton.click();
}

test.beforeEach(async ({ page }) => {
  // Surface anything the app logs in the browser; a silent page error would
  // otherwise only show up as a selector timeout.
  page.on("pageerror", (error) => console.log(`[pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[console.error] ${message.text()}`);
  });

  // Keep the suite offline and deterministic. Reads are not what these tests
  // cover, and a live Studionet call would make them slow and flaky.
  await page.route("https://studio.genlayer.com/**", (route) => route.abort());
});

test("the fake wallet is installed and the page renders", async ({ page }) => {
  await installMockWallet(page);
  await page.goto("/");

  // If this is false the init script itself is broken, which would explain every
  // "wallet never appeared" failure below.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __mockWalletInstalled?: boolean }).__mockWalletInstalled)))
    .toBe(true);

  await expect(page).toHaveTitle(/Public Pledge/);
  await expect(page.getByRole("button", { name: CONNECT })).toBeVisible();
});

test("connecting talks to the wallet the user picks", async ({ page }) => {
  await installMockWallet(page);
  await page.goto("/");

  await connectMockWallet(page);

  await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();
  await expect(page.getByRole("button", { name: CONNECT })).toHaveCount(0);

  const calls = await walletCalls(page);
  expect(calls).toContain("eth_requestAccounts");
  // Connecting must never ask for a signature or send anything.
  expect(calls).not.toContain("eth_sendTransaction");
});

test("a dismissed wallet prompt is reported, not swallowed", async ({ page }) => {
  await installMockWallet(page, { rejectConnect: true });
  await page.goto("/");

  await connectMockWallet(page);

  await expect(page.getByText("Request cancelled")).toBeVisible();
  // Still disconnected, and the button is usable again.
  await expect(page.getByRole("button", { name: CONNECT })).toBeVisible();
});

test("a wallet on another chain is asked to switch exactly once", async ({ page }) => {
  await installMockWallet(page, { chainId: 1 });
  await page.goto("/");

  await connectMockWallet(page);

  const switchButton = page.getByRole("button", { name: /Switch to Studionet/ });
  await expect(switchButton).toBeVisible();
  await switchButton.click();

  await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();

  const calls = await walletCalls(page);
  expect(calls.filter((call) => call === "wallet_switchEthereumChain")).toHaveLength(1);
});

test("the create form explains what is missing without asking for a signature", async ({
  page,
}) => {
  await installMockWallet(page);
  await page.goto("/create");

  await connectMockWallet(page);
  await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();

  await page.getByRole("button", { name: "Lock stake and create pledge" }).click();

  await expect(page.getByText("Fix the highlighted fields to continue.")).toBeVisible();
  await expect(page.getByText("Describe what you promise to do.")).toBeVisible();
  await expect(page.getByText("Add the public page validators will read.")).toBeVisible();

  // Validation is local: nothing reached the wallet beyond accounts and chain.
  const calls = await walletCalls(page);
  expect(calls).not.toContain("eth_sendTransaction");
});
