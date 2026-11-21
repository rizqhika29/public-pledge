// Checks that the contract this frontend is pinned to can be read, and probes the
// ways a read can be addressed, because a "Contract <address> not found" answer
// can come from the address itself or from how the read is issued.
//
// The probes are deliberately a matrix rather than a guess:
//   - our address as pinned (all lowercase) and as an EIP-55 checksum,
//   - the read evaluated against each transaction snapshot variant,
//   - a control contract on the same chain, deployed by the same team from
//     gentrophy, which tells us whether a failure is about this address or
//     about the read path itself.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

// GenTrophy on Studionet, read by the same kind of client. Only used as a control.
const CONTROL_ADDRESS = "0x2C02539A051F62007254abFdFcF0982f0Fa4e7Ec";
const CONTROL_METHOD = "get_stats";

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

let checksummed;
try {
  checksummed = getAddress(address);
} catch (error) {
  throw new Error(`CONTRACT_ADDRESS is not a valid address: ${address} (${String(error)})`);
}

console.log(`Chain:   ${network} (id ${chain.id})`);
console.log(`RPC:     ${chain.rpcUrls?.default?.http?.[0] ?? "unknown"}`);
console.log(`Address: ${address}`);
console.log(`Checksum: ${checksummed}`);
console.log("");

const probes = [
  { label: "ours / lowercase / default", to: address, options: {} },
  { label: "ours / checksummed / default", to: checksummed, options: {} },
  {
    label: "ours / lowercase / latest-final",
    to: address,
    options: { transactionHashVariant: "latest-final" },
  },
  {
    label: "ours / checksummed / latest-final",
    to: checksummed,
    options: { transactionHashVariant: "latest-final" },
  },
  {
    label: "ours / checksummed / latest-nonfinal",
    to: checksummed,
    options: { transactionHashVariant: "latest-nonfinal" },
  },
  { label: "control (GentTrophy) / default", to: CONTROL_ADDRESS, options: {}, control: true },
];

const results = [];

for (const probe of probes) {
  try {
    const client = createClient({ chain });
    const value = await client.readContract({
      address: probe.to,
      functionName: probe.control ? CONTROL_METHOD : "get_pledge_count",
      args: [],
      ...probe.options,
    });
    results.push({ ...probe, ok: true });
    console.log(`OK    ${probe.label}: ${String(value)}`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0];
    results.push({ ...probe, ok: false, message });
    console.log(`FAIL  ${probe.label}: ${message}`);
  }
}

console.log("");

const ourAddressWorks = results.some((r) => !r.control && r.ok);
const controlWorks = results.some((r) => r.control && r.ok);

if (ourAddressWorks) {
  console.log("The pinned contract is readable. Use the options from the first passing probe.");
  process.exit(0);
}

if (controlWorks) {
  console.error("Our address fails every read, while a control contract on the same chain reads");
  console.error("fine, so the address pinned in lib/config.ts is not on this chain.");
  console.error("Deploy again (Actions -> On-chain checks) and pin the address that run prints.");
} else {
  console.error("Neither our contract nor the control contract can be read, so the problem is in");
  console.error("the read path or the node, not in our address. Do not re-pin anything yet.");
}

process.exit(1);
