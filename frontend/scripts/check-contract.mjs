// Checks that the contract this frontend is pinned to can be read.
//
// Two failures are worth catching here, and both are invisible until someone
// opens the site:
//   1. The address must be EIP-55 checksummed. Studionet resolves a contract by
//      the address *string*, so the same address in all lowercase answers
//      "Contract 0x… not found" even though the contract is live.
//   2. The contract must still exist on the chain. It is read here through the
//      same SDK and chain the browser uses, against each transaction snapshot
//      variant, with a control contract to tell "our address is gone" apart from
//      "the read path is broken".

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

// GenTrophy on Studionet, deployed from the same account. Only a control read.
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

console.log(`Chain:    ${network} (id ${chain.id})`);
console.log(`RPC:      ${chain.rpcUrls?.default?.http?.[0] ?? "unknown"}`);
console.log(`Address:  ${address}`);
console.log(`Checksum: ${checksummed}`);
console.log("");

if (checksummed !== address) {
  console.error("CONTRACT_ADDRESS is not in EIP-55 checksum form.");
  console.error(`  got:      ${address}`);
  console.error(`  expected: ${checksummed}`);
  console.error("");
  console.error("Studionet resolves a contract by the address string: the all-lowercase form");
  console.error('answers "Contract 0x… not found" for a contract that exists. Copy the address');
  console.error("exactly as the deploy printed it.");
  process.exit(1);
}

const probes = [
  { label: "default", options: {} },
  { label: "latest-final", options: { transactionHashVariant: "latest-final" } },
  { label: "latest-nonfinal", options: { transactionHashVariant: "latest-nonfinal" } },
];

const results = [];

for (const probe of probes) {
  try {
    const client = createClient({ chain });
    const value = await client.readContract({
      address,
      functionName: "get_pledge_count",
      args: [],
      ...probe.options,
    });
    results.push({ ...probe, ok: true });
    console.log(`OK    ${probe.label}: ${String(value)} pledge(s)`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0];
    results.push({ ...probe, ok: false, message });
    console.log(`FAIL  ${probe.label}: ${message}`);
  }
}

let controlWorks = false;
try {
  const client = createClient({ chain });
  await client.readContract({
    address: CONTROL_ADDRESS,
    functionName: CONTROL_METHOD,
    args: [],
  });
  controlWorks = true;
  console.log("OK    control (GenTrophy)");
} catch (error) {
  const message = (error instanceof Error ? error.message : String(error)).split("\n")[0];
  console.log(`FAIL  control (GenTrophy): ${message}`);
}

console.log("");

if (results.some((result) => result.ok)) {
  const working = results.filter((result) => result.ok).map((result) => result.label);
  console.log(`The pinned contract is readable (${working.join(", ")}).`);
  process.exit(0);
}

if (controlWorks) {
  console.error("Our address fails every read while a control contract on the same chain reads");
  console.error("fine, so the pinned address is not on this chain any more. Deploy again");
  console.error("(Actions -> On-chain checks) and pin the address that run prints.");
} else {
  console.error("Neither our contract nor the control contract can be read, so the read path or");
  console.error("the node is at fault. Do not re-pin anything yet.");
}

process.exit(1);
