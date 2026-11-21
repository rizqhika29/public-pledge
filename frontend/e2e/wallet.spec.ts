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

test.beforeEach(async ({ page }) => {
  // Keep the suite offline and deterministic. Reads are not what these tests
  // cover, and a live Studionet call would make them slow and flaky.
  await page.route("https://studio.genlayer.com/**", (route) => route.abort());
});

test("the landing page renders and offers a wallet", async ({ page }) => {
  await installMockWallet(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/Public Pledge/);
  await expect(page.getByRole("button", { name: CONNECT })).toBeVisible();
});

test("connecting talks to the wallet the user picks", async ({ page }) => {
  await installMockWallet(page);
  await page.goto("/");

  await page.getByRole("button", { name: CONNECT }).click();
  await page.getByRole("button", { name: MOCK_WALLET }).click();

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

  await page.getByRole("button", { name: CONNECT }).click();
  await page.getByRole("button", { name: MOCK_WALLET }).click();

  await expect(page.getByText("Request cancelled")).toBeVisible();
  // Still disconnected, and the button is usable again.
  await expect(page.getByRole("button", { name: CONNECT })).toBeVisible();
});

test("a wallet on another chain is asked to switch exactly once", async ({ page }) => {
  await installMockWallet(page, { chainId: 1 });
  await page.goto("/");

  await page.getByRole("button", { name: CONNECT }).click();
  await page.getByRole("button", { name: MOCK_WALLET }).click();

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

  await page.getByRole("button", { name: CONNECT }).click();
  await page.getByRole("button", { name: MOCK_WALLET }).click();
  await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();

  await page.getByRole("button", { name: "Lock stake and create pledge" }).click();

  await expect(page.getByText("Fix the highlighted fields to continue.")).toBeVisible();
  await expect(page.getByText("Describe what you promise to do.")).toBeVisible();
  await expect(page.getByText("Add the public page validators will read.")).toBeVisible();

  // Validation is local: nothing reached the wallet beyond accounts and chain.
  const calls = await walletCalls(page);
  expect(calls).not.toContain("eth_sendTransaction");
});
