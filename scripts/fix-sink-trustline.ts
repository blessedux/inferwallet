/**
 * One-shot: open SZX trustline on the Pay-to-Sink account.
 * Required for classic asset payments — without it Horizon returns op_no_trust (400).
 *
 * Usage: bun run scripts/fix-sink-trustline.ts
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
const SECRETS_PATH = join(ROOT, ".secrets", "szx-testnet.json");

type SecretsFile = {
  issuerPublic: string;
  sinkPublic: string;
  sinkSecret: string;
};

async function main() {
  const secrets = JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as SecretsFile;
  const sinkKp = Keypair.fromSecret(secrets.sinkSecret);
  const szx = new Asset("SZX", secrets.issuerPublic);
  const server = new Horizon.Server(HORIZON_URL);

  const account = await server.loadAccount(secrets.sinkPublic);
  const has = account.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "SZX" &&
      b.asset_issuer === secrets.issuerPublic,
  );
  if (has) {
    console.log("Sink already has SZX trustline:", secrets.sinkPublic);
    return;
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: szx }))
    .setTimeout(180)
    .build();
  tx.sign(sinkKp);

  try {
    const result = await server.submitTransaction(tx);
    console.log("Opened sink SZX trustline:", result.hash);
  } catch (err: unknown) {
    const extras =
      err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error("Submit failed extras:", JSON.stringify(extras, null, 2));
    throw err;
  }

  const reload = await server.loadAccount(secrets.sinkPublic);
  console.log(
    "balances:",
    reload.balances.map((b) => ({
      type: b.asset_type,
      code: "asset_code" in b ? b.asset_code : "XLM",
      bal: b.balance,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
