/**
 * Diagnose Pay-to-Sink submit. Optionally pass a Freighter G… address:
 *   npx tsx scripts/diagnose-pay-to-sink.ts G...
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { buildPayToSink, quoteSzxForUsdFeel } from "../packages/sdk/src/index.ts";
import { HORIZON_URL } from "./szx-constants.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const secrets = JSON.parse(
  readFileSync(join(ROOT, ".secrets", "szx-testnet.json"), "utf8"),
) as {
  issuerPublic: string;
  sinkPublic: string;
  distributorSecret: string;
  distributorPublic: string;
};

const config = {
  asset: { code: "SZX" as const, issuer: secrets.issuerPublic },
  sink: secrets.sinkPublic,
  horizonUrl: HORIZON_URL,
  networkPassphrase: Networks.TESTNET,
  quoteAsset: {
    code: "USDC" as const,
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
};

async function inspectAccount(label: string, pubkey: string) {
  const server = new Horizon.Server(HORIZON_URL);
  try {
    const a = await server.loadAccount(pubkey);
    const szx = a.balances.find(
      (b) =>
        b.asset_type !== "native" &&
        "asset_code" in b &&
        b.asset_code === "SZX" &&
        b.asset_issuer === secrets.issuerPublic,
    );
    console.log(`\n[${label}] ${pubkey}`);
    console.log("  sequence", a.sequence);
    console.log(
      "  SZX",
      szx && "balance" in szx ? szx.balance : "NO TRUSTLINE",
    );
    console.log(
      "  XLM",
      a.balances.find((b) => b.asset_type === "native")?.balance,
    );
    return a;
  } catch (e) {
    console.log(`\n[${label}] ${pubkey} — NOT FOUND on testnet`, e);
    return null;
  }
}

async function trySubmitFromDistributor(usd: number) {
  const server = new Horizon.Server(HORIZON_URL);
  const quote = await quoteSzxForUsdFeel(config, usd);
  console.log("\n[quote]", quote);

  const distKp = Keypair.fromSecret(secrets.distributorSecret);
  const account = await server.loadAccount(distKp.publicKey());
  const built = buildPayToSink(config, {
    sourcePublicKey: distKp.publicKey(),
    sequence: account.sequenceNumber(),
    szxAmount: quote.szxAmount,
    requestId: `prepay:diag${Date.now().toString(36).slice(-8)}`,
  });
  console.log("[built]", { binding: built.binding, amount: built.szxAmount });

  const tx = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET);
  tx.sign(distKp);
  try {
    const r = await server.submitTransaction(tx);
    console.log("[distributor→sink] SUCCESS", r.hash);
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { data?: unknown } };
    console.log("[distributor→sink] FAIL", e.message);
    console.log(JSON.stringify(e.response?.data, null, 2));
  }
}

async function main() {
  const user = process.argv[2];
  await inspectAccount("sink", secrets.sinkPublic);
  await inspectAccount("distributor", secrets.distributorPublic);
  if (user) await inspectAccount("user", user);
  await trySubmitFromDistributor(1.0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
