/**
 * Send testnet SZX from distributor → Freighter wallet (must already trust SZX).
 *
 * Usage:
 *   npx tsx scripts/fund-freighter-szx.ts G... [amount]
 *
 * Default amount: 1000 SZX (~$10 Fixed USD Feel at $0.01/SZX).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { HORIZON_URL } from "./szx-constants.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const secrets = JSON.parse(
  readFileSync(join(ROOT, ".secrets", "szx-testnet.json"), "utf8"),
) as {
  issuerPublic: string;
  distributorSecret: string;
  distributorPublic: string;
};

async function main() {
  const dest = process.argv[2];
  const amount = process.argv[3] ?? "1000";
  if (!dest?.startsWith("G")) {
    console.error("Usage: npx tsx scripts/fund-freighter-szx.ts G... [amount]");
    process.exit(1);
  }

  const server = new Horizon.Server(HORIZON_URL);
  const szx = new Asset("SZX", secrets.issuerPublic);

  let destAcc;
  try {
    destAcc = await server.loadAccount(dest);
  } catch {
    console.error(`Destination ${dest} not found on testnet — Friendbot-fund it first.`);
    process.exit(1);
  }

  const hasTrust = destAcc.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "SZX" &&
      b.asset_issuer === secrets.issuerPublic,
  );
  if (!hasTrust) {
    console.error(
      [
        `No SZX trustline on ${dest}.`,
        "In Freighter (Testnet): Add asset → code SZX, issuer:",
        secrets.issuerPublic,
        "Then re-run this script.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const distKp = Keypair.fromSecret(secrets.distributorSecret);
  const distAcc = await server.loadAccount(distKp.publicKey());
  const tx = new TransactionBuilder(distAcc, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: dest,
        asset: szx,
        amount,
      }),
    )
    .setTimeout(180)
    .build();
  tx.sign(distKp);

  const result = await server.submitTransaction(tx);
  console.log(`Sent ${amount} SZX → ${dest}`);
  console.log(`hash ${result.hash}`);
}

main().catch((err) => {
  const e = err as { message?: string; response?: { data?: unknown } };
  console.error(e.message);
  if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
