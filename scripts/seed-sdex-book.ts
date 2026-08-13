/**
 * Place SZX/USDC SDEX liquidity from the distributor.
 *
 * Usage:
 *   bun run scripts/seed-sdex-book.ts              # asks only (15M SZX @ 0.01)
 *   bun run scripts/seed-sdex-book.ts --with-bids  # also bid with available USDC
 */

import { readFileSync, existsSync } from "node:fs";
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
import {
  HORIZON_URL,
  POOL_SZX_INVENTORY,
  POOL_USDC_TARGET,
  TARGET_PRICE_USDC_PER_SZX,
  TESTNET_USDC,
} from "./szx-constants.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRETS_PATH = join(ROOT, ".secrets", "szx-testnet.json");

async function main() {
  const withBids = process.argv.includes("--with-bids");
  if (!existsSync(SECRETS_PATH)) {
    throw new Error(
      "Missing .secrets/szx-testnet.json — run issue-szx-testnet.ts first",
    );
  }
  const secrets = JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as {
    issuerPublic: string;
    distributorSecret: string;
    distributorPublic: string;
  };

  const distKp = Keypair.fromSecret(secrets.distributorSecret);
  const szx = new Asset("SZX", secrets.issuerPublic);
  const server = new Horizon.Server(HORIZON_URL);
  let account = await server.loadAccount(secrets.distributorPublic);

  const hasUsdcTrust = account.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "USDC" &&
      b.asset_issuer === TESTNET_USDC.getIssuer(),
  );
  if (!hasUsdcTrust) {
    console.log("Opening USDC trustline on distributor…");
    const trustTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: TESTNET_USDC }))
      .setTimeout(180)
      .build();
    trustTx.sign(distKp);
    await server.submitTransaction(trustTx);
    account = await server.loadAccount(secrets.distributorPublic);
  }

  const usdcBal = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "USDC" &&
      b.asset_issuer === TESTNET_USDC.getIssuer(),
  );
  const usdc = usdcBal && "balance" in usdcBal ? usdcBal.balance : "0";

  console.log("Distributor", secrets.distributorPublic);
  console.log("USDC balance:", usdc);
  console.log(
    `Placing ask: sell ${POOL_SZX_INVENTORY} SZX buying USDC @ ${TARGET_PRICE_USDC_PER_SZX}`,
  );

  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    Operation.manageSellOffer({
      selling: szx,
      buying: TESTNET_USDC,
      amount: POOL_SZX_INVENTORY,
      price: TARGET_PRICE_USDC_PER_SZX,
      offerId: "0",
    }),
  );

  if (withBids) {
    if (Number(usdc) <= 0) {
      throw new Error(
        `No USDC on distributor — fund ~${POOL_USDC_TARGET} classic testnet USDC then re-run --with-bids`,
      );
    }
    const bidAmount = Math.min(Number(usdc), Number(POOL_USDC_TARGET)).toFixed(
      7,
    );
    console.log(
      `Placing bid: sell ${bidAmount} USDC buying SZX @ ${TARGET_PRICE_USDC_PER_SZX}`,
    );
    builder = builder.addOperation(
      Operation.manageSellOffer({
        selling: TESTNET_USDC,
        buying: szx,
        amount: bidAmount,
        price: TARGET_PRICE_USDC_PER_SZX,
        offerId: "0",
      }),
    );
  }

  const tx = builder.setTimeout(180).build();
  tx.sign(distKp);
  try {
    const result = await server.submitTransaction(tx);
    console.log("Seeded. tx:", result.hash);
  } catch (err: unknown) {
    const extras =
      err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error("Submit failed extras:", JSON.stringify(extras, null, 2));
    throw err;
  }
  console.log(
    `Book: https://stellar.expert/explorer/testnet/asset/SZX-${secrets.issuerPublic}`,
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
