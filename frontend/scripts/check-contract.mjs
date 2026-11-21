// Fails when the contract this frontend is pinned to cannot be read.
//
// The address is compiled into the app, so a stale or mistyped one only shows up
// as "contract not found" in a browser console. This reads the same view the home
// page reads, through the same SDK and the same chain the browser uses, so CI
// catches it before anyone opens the site.

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

try {
  const client = createClient({ chain });
  const count = await client.readContract({
    address,
    functionName: "get_pledge_count",
    args: [],
  });
  console.log(`Pinned contract ${address} answered on ${network}: ${String(count)} pledge(s).`);
  console.log(`RPC: ${rpc}`);
} catch (error) {
  console.error(`The pinned contract could not be read on ${network}.`);
  console.error(`  address: ${address}`);
  console.error(`  rpc:     ${rpc}`);
  console.error(`  error:   ${error instanceof Error ? error.message : String(error)}`);
  console.error("");
  console.error("The frontend would show this as an RPC error in the browser console.");
  console.error("Deploy the contract again (Actions -> On-chain checks), then update CONTRACT_ADDRESS");
  console.error("in frontend/lib/config.ts to the address that run printed.");
  process.exit(1);
}
