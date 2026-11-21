// Checks that the contract this frontend is pinned to can be read, and probes
// which read options work.
//
// The address is compiled into the app, so a failed read only shows up as an RPC
// error in a browser console. This runs the same SDK against the same chain, and
// tries each `transactionHashVariant` because a read is evaluated against a
// transaction snapshot: `latest-nonfinal` and `latest-final` can resolve to
// different points in the chain's history.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";

const configPath = fileURLToPath(new URL("../lib/config.ts", import.meta.url));
const source = fs.readFileSync(configPath, "utf8");

/** Read a string constant out of lib/config.ts, so this checks the shipped value. */
function constant(name) {
  // The constant may carry a type annotation, e.g. `NETWORK_KEY: NetworkKey = "studionet"`.
  const pattern = new RegExp(`export const ${name}\\s*(?::[^=]+)?=\\s*"([^"]+)"`);
  const match = pattern.exec(source);
  if (!match) throw new Error(`${name} was not found in lib/config.ts`);
  return match[1];
}

const chains = { studionet, localnet };

const network = constant("NETWORK_KEY");
const address = constant("CONTRACT_ADDRESS");
const chain = chains[network];

if (!chain) throw new Error(`lib/config.ts names an unknown network: ${network}`);
if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  throw new Error(`CONTRACT_ADDRESS is not a valid address: ${address}`);
}

const rpc = chain.rpcUrls?.default?.http?.[0] ?? "unknown";
console.log(`Chain:   ${network} (id ${chain.id})`);
console.log(`RPC:     ${rpc}`);
console.log(`Address: ${address}`);
console.log("");

const probes = [
  { label: "default (how the app calls it)", options: {} },
  { label: "latest-nonfinal", options: { transactionHashVariant: "latest-nonfinal" } },
  { label: "latest-final", options: { transactionHashVariant: "latest-final" } },
];

const failures = [];

for (const probe of probes) {
  try {
    const client = createClient({ chain });
    const value = await client.readContract({
      address,
      functionName: "get_pledge_count",
      args: [],
      ...probe.options,
    });
    console.log(`OK    ${probe.label}: ${String(value)} pledge(s)`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0];
    failures.push({ label: probe.label, message });
    console.log(`FAIL  ${probe.label}: ${message}`);
  }
}

console.log("");

if (failures.length === probes.length) {
  console.error("No read option could reach the contract. Either the address is not on this");
  console.error("chain any more, or this build is calling it in a way the node rejects.");
  process.exit(1);
}

const working = probes.filter((probe) => !failures.some((f) => f.label === probe.label));
if (failures.length > 0) {
  console.log("Some read options failed. The app must use one that works:");
  for (const probe of working) console.log(`  ${probe.label} -> ${JSON.stringify(probe.options)}`);
}
