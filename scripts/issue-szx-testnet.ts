/**
 * Issue classic SZX on Stellar testnet + write public config.
 *
 * Secrets are written ONLY to .secrets/ (gitignored). Never commit them.
 *
 * Usage:
 *   bun run scripts/issue-szx-testnet.ts
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
  TOTAL_SUPPLY,
} from "./szx-constants.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRETS_PATH = join(ROOT, ".secrets", "szx-testnet.json");
const PUBLIC_PATH = join(ROOT, "docs", "testnet-assets.json");
const NETWORK = Networks.TESTNET;

type SecretsFile = {
  network: "testnet";
  createdAt: string;
  issuerSecret: string;
  distributorSecret: string;
  sinkSecret: string;
  issuerPublic: string;
  distributorPublic: string;
  sinkPublic: string;
  assetCode: "SZX";
  totalSupply: string;
  usdcIssuer: string;
};

type PublicFile = {
  network: "testnet";
  horizonUrl: string;
  networkPassphrase: string;
  asset: { code: "SZX"; issuer: string };
  distributor: string;
  sink: string;
  quoteAsset: { code: "USDC"; issuer: string };
  totalSupply: string;
  targetPriceUsdcPerSzx: string;
  poolUsdcTarget: string;
  poolSzxInventory: string;
  issuerLocked: false;
  stellarExpertAsset: string;
  notes: string[];
};

async function friendbot(pubkey: string) {
  const res = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(pubkey)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    if (!text.includes("createAccountAlreadyExist") && res.status !== 400) {
      throw new Error(`Friendbot failed for ${pubkey}: ${res.status} ${text}`);
    }
  }
}

async function loadAccount(server: Horizon.Server, pubkey: string) {
  for (let i = 0; i < 8; i++) {
    try {
      return await server.loadAccount(pubkey);
    } catch {
      await Bun.sleep(1000);
    }
  }
  throw new Error(`Account not found after funding: ${pubkey}`);
}

function loadOrCreateSecrets(): { secrets: SecretsFile; created: boolean } {
  if (existsSync(SECRETS_PATH)) {
    return {
      secrets: JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as SecretsFile,
      created: false,
    };
  }
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const sink = Keypair.random();
  const secrets: SecretsFile = {
    network: "testnet",
    createdAt: new Date().toISOString(),
    issuerSecret: issuer.secret(),
    distributorSecret: distributor.secret(),
    sinkSecret: sink.secret(),
    issuerPublic: issuer.publicKey(),
    distributorPublic: distributor.publicKey(),
    sinkPublic: sink.publicKey(),
    assetCode: "SZX",
    totalSupply: TOTAL_SUPPLY,
    usdcIssuer: TESTNET_USDC.getIssuer(),
  };
  mkdirSync(dirname(SECRETS_PATH), { recursive: true });
  writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2) + "\n", {
    mode: 0o600,
  });
  return { secrets, created: true };
}

async function submit(
  server: Horizon.Server,
  builder: TransactionBuilder,
  signers: Keypair[],
) {
  const tx = builder.setTimeout(180).build();
  for (const s of signers) tx.sign(s);
  try {
    return await server.submitTransaction(tx);
  } catch (err: unknown) {
    const extras =
      err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error("Submit failed extras:", JSON.stringify(extras, null, 2));
    throw err;
  }
}

async function main() {
  const { secrets, created } = loadOrCreateSecrets();
  const issuerKp = Keypair.fromSecret(secrets.issuerSecret);
  const distKp = Keypair.fromSecret(secrets.distributorSecret);
  const sinkKp = Keypair.fromSecret(secrets.sinkSecret);
  const szx = new Asset("SZX", issuerKp.publicKey());
  const server = new Horizon.Server(HORIZON_URL);

  console.log(
    created
      ? "Generated new keypairs → .secrets/szx-testnet.json"
      : "Reusing .secrets/szx-testnet.json",
  );
  console.log("Issuer:     ", secrets.issuerPublic);
  console.log("Distributor:", secrets.distributorPublic);
  console.log("Sink:       ", secrets.sinkPublic);

  console.log("Funding accounts via Friendbot…");
  await Promise.all([
    friendbot(secrets.issuerPublic),
    friendbot(secrets.distributorPublic),
    friendbot(secrets.sinkPublic),
  ]);

  const distAccount = await loadAccount(server, secrets.distributorPublic);
  const sinkAccount = await loadAccount(server, secrets.sinkPublic);

  const hasSzxTrust = distAccount.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "SZX" &&
      b.asset_issuer === secrets.issuerPublic,
  );

  if (!hasSzxTrust) {
    console.log("Creating distributor SZX trustline…");
    await submit(
      server,
      new TransactionBuilder(distAccount, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK,
      }).addOperation(Operation.changeTrust({ asset: szx })),
      [distKp],
    );
  }

  // Sink must trust SZX or every Pay-to-Sink fails with op_no_trust (Horizon 400).
  const sinkHasSzxTrust = sinkAccount.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "SZX" &&
      b.asset_issuer === secrets.issuerPublic,
  );
  if (!sinkHasSzxTrust) {
    console.log("Creating sink SZX trustline…");
    await submit(
      server,
      new TransactionBuilder(sinkAccount, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK,
      }).addOperation(Operation.changeTrust({ asset: szx })),
      [sinkKp],
    );
  }

  // USDC trustline required before SDEX offers that buy USDC
  const distAfterSzx = await loadAccount(server, secrets.distributorPublic);
  const hasUsdcTrust = distAfterSzx.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "USDC" &&
      b.asset_issuer === TESTNET_USDC.getIssuer(),
  );
  if (!hasUsdcTrust) {
    console.log("Creating distributor USDC trustline…");
    await submit(
      server,
      new TransactionBuilder(distAfterSzx, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK,
      }).addOperation(Operation.changeTrust({ asset: TESTNET_USDC })),
      [distKp],
    );
  }

  const distReload = await loadAccount(server, secrets.distributorPublic);
  const szxBal = distReload.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "SZX" &&
      b.asset_issuer === secrets.issuerPublic,
  );
  const bal = szxBal && "balance" in szxBal ? szxBal.balance : "0";

  if (Number(bal) < Number(TOTAL_SUPPLY) * 0.9) {
    console.log(`Issuing ${TOTAL_SUPPLY} SZX to distributor…`);
    const issuerReload = await loadAccount(server, secrets.issuerPublic);
    await submit(
      server,
      new TransactionBuilder(issuerReload, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK,
      }).addOperation(
        Operation.payment({
          destination: secrets.distributorPublic,
          asset: szx,
          amount: TOTAL_SUPPLY,
        }),
      ),
      [issuerKp],
    );
  } else {
    console.log(`Distributor already holds ~${bal} SZX — skip issue`);
  }

  // Issuer stays unlocked on testnet.

  const publicDoc: PublicFile = {
    network: "testnet",
    horizonUrl: HORIZON_URL,
    networkPassphrase: "Test SDF Network ; September 2015",
    asset: { code: "SZX", issuer: secrets.issuerPublic },
    distributor: secrets.distributorPublic,
    sink: secrets.sinkPublic,
    quoteAsset: { code: "USDC", issuer: TESTNET_USDC.getIssuer() },
    totalSupply: TOTAL_SUPPLY,
    targetPriceUsdcPerSzx: TARGET_PRICE_USDC_PER_SZX,
    poolUsdcTarget: POOL_USDC_TARGET,
    poolSzxInventory: POOL_SZX_INVENTORY,
    issuerLocked: false,
    stellarExpertAsset: `https://stellar.expert/explorer/testnet/asset/SZX-${secrets.issuerPublic}`,
    notes: [
      "Secrets live in vault only — never commit .secrets/",
      "Joaquin places 150k classic testnet USDC to complete the first pool (bids).",
      "Run: bun run seed:sdex  then  bun run seed:sdex -- --with-bids",
    ],
  };
  writeFileSync(PUBLIC_PATH, JSON.stringify(publicDoc, null, 2) + "\n");
  console.log("Wrote public config →", PUBLIC_PATH);
  console.log("Done. Vault .secrets/szx-testnet.json then delete the local copy.");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
