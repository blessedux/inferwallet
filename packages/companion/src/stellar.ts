import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
  setAllowed,
} from "@stellar/freighter-api";
import {
  Horizon,
  TransactionBuilder,
  Networks,
} from "@stellar/stellar-sdk";
import {
  amountGte,
  buildPayToSink,
  buildSwapUsdcToSzx,
  quoteSzxForUsdFeel,
  quoteSzxForUsdc,
  type SzxConfig,
} from "@inferwallet/sdk";
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  PROXY_URL,
  SZX_CONFIG,
  type TierId,
  TIERS,
} from "./config";

export type PendingFromProxy = {
  id: string;
  tier: TierId;
  usdFeel: number;
  status: string;
  szxAmount: string | null;
};

export type WalletBalances = {
  usdc: string;
  szx: string;
  xlm: string;
};

/** Surface Horizon result_codes instead of opaque "400 Bad Request". */
function formatSubmitError(err: unknown): Error {
  if (!err || typeof err !== "object") {
    return new Error(String(err));
  }
  const e = err as {
    message?: string;
    response?: {
      data?: {
        title?: string;
        detail?: string;
        extras?: {
          result_codes?: { transaction?: string; operations?: string[] };
        };
      };
    };
  };
  const codes = e.response?.data?.extras?.result_codes;
  if (codes) {
    const ops = codes.operations?.join(", ") ?? "";
    const tx = codes.transaction ?? "";
    return new Error(
      `Transaction rejected: ${[tx, ops].filter(Boolean).join(" / ") || e.message || "unknown"}`,
    );
  }
  return new Error(e.message ?? String(err));
}

async function submitSigned(
  server: Horizon.Server,
  signedTxXdr: string,
): Promise<{ hash: string }> {
  const tx = TransactionBuilder.fromXDR(
    signedTxXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );
  try {
    return await server.submitTransaction(tx);
  } catch (err) {
    throw formatSubmitError(err);
  }
}

async function assertFreighterTestnet(): Promise<void> {
  const net = await getNetwork();
  const name = (net.network ?? "").toUpperCase();
  const pass = net.networkPassphrase ?? "";
  const ok =
    name === "TESTNET" ||
    name === "TEST" ||
    pass === NETWORK_PASSPHRASE ||
    pass === Networks.TESTNET;
  if (!ok) {
    throw new Error(
      `Freighter is on ${net.network ?? "unknown"} — switch to Testnet before paying`,
    );
  }
}

export async function fetchBalances(publicKey: string): Promise<WalletBalances> {
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(publicKey);
  
  const usdcBal = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === SZX_CONFIG.quoteAsset.code &&
      b.asset_issuer === SZX_CONFIG.quoteAsset.issuer,
  );
  
  const szxBal = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === SZX_CONFIG.asset.code &&
      b.asset_issuer === SZX_CONFIG.asset.issuer,
  );
  
  const xlmBal = account.balances.find((b) => b.asset_type === "native");
  
  return {
    usdc: usdcBal && "balance" in usdcBal ? usdcBal.balance : "0",
    szx: szxBal && "balance" in szxBal ? szxBal.balance : "0",
    xlm: xlmBal && "balance" in xlmBal ? xlmBal.balance : "0",
  };
}

/** Fail before Freighter popup if the wallet cannot swap USDC. */
async function assertCanSwapUsdc(
  server: Horizon.Server,
  publicKey: string,
  usdcAmount: string,
): Promise<void> {
  const account = await server.loadAccount(publicKey);
  
  // Check USDC balance
  const usdcBal = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === SZX_CONFIG.quoteAsset.code &&
      b.asset_issuer === SZX_CONFIG.quoteAsset.issuer,
  );
  if (!usdcBal || !("balance" in usdcBal)) {
    throw new Error(
      `No USDC trustline. In Freighter (Testnet) add asset USDC / ${SZX_CONFIG.quoteAsset.issuer}`,
    );
  }
  if (!amountGte(usdcBal.balance, usdcAmount)) {
    throw new Error(
      `Insufficient USDC: need ${usdcAmount}, wallet has ${usdcBal.balance}`,
    );
  }
  
  // Check SZX trustline exists
  const szxBal = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === SZX_CONFIG.asset.code &&
      b.asset_issuer === SZX_CONFIG.asset.issuer,
  );
  if (!szxBal) {
    throw new Error(
      `No SZX trustline. In Freighter (Testnet) add asset SZX / ${SZX_CONFIG.asset.issuer}`,
    );
  }
}

export async function swapUsdcForSzx(
  publicKey: string,
  usdc: number,
): Promise<{ hash: string; szxAmount: string }> {
  await assertFreighterTestnet();
  const quote = await quoteSzxForUsdc(SZX_CONFIG as SzxConfig, usdc);
  const server = new Horizon.Server(HORIZON_URL);
  await assertCanSwapUsdc(server, publicKey, String(usdc));
  const account = await server.loadAccount(publicKey);
  
  const built = buildSwapUsdcToSzx(SZX_CONFIG as SzxConfig, {
    sourcePublicKey: publicKey,
    sequence: account.sequenceNumber(),
    usdcAmount: String(usdc),
    minSzxOut: quote.szxAmount,
  });
  
  const signed = await signTransaction(built.xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Freighter did not return signed XDR");
  }
  
  const result = await submitSigned(server, signed.signedTxXdr);
  return { hash: result.hash, szxAmount: quote.szxAmount };
}

/** Fail before Freighter popup if the wallet cannot Pay-to-Sink. */
async function assertCanPaySzx(
  server: Horizon.Server,
  publicKey: string,
  szxAmount: string,
): Promise<void> {
  const account = await server.loadAccount(publicKey);
  const bal = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === SZX_CONFIG.asset.code &&
      b.asset_issuer === SZX_CONFIG.asset.issuer,
  );
  if (!bal || !("balance" in bal)) {
    throw new Error(
      `No SZX trustline. In Freighter (Testnet) add asset SZX / ${SZX_CONFIG.asset.issuer}`,
    );
  }
  if (!amountGte(bal.balance, szxAmount)) {
    throw new Error(
      `Insufficient SZX: need ${szxAmount}, wallet has ${bal.balance}. Fund the wallet from the distributor first.`,
    );
  }
}

export async function freighterAvailable(): Promise<boolean> {
  try {
    const { isConnected: connected } = await isConnected();
    return Boolean(connected);
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<{
  address: string;
  network: string;
}> {
  await setAllowed();
  const access = await requestAccess();
  if (access.error) throw new Error(access.error);
  const addr = await getAddress();
  if (addr.error || !addr.address) {
    throw new Error(addr.error ?? "No Freighter address");
  }
  const net = await getNetwork();
  return {
    address: addr.address,
    network: net.network ?? "TESTNET",
  };
}

export async function fetchQuote(tier: TierId) {
  const usdFeel = TIERS[tier].usdFeel;
  return quoteSzxForUsdFeel(SZX_CONFIG as SzxConfig, usdFeel);
}

export async function fetchPending(): Promise<PendingFromProxy[]> {
  const res = await fetch(`${PROXY_URL}/v1/pending`);
  if (!res.ok) throw new Error(`pending ${res.status}`);
  const body = (await res.json()) as { pending: PendingFromProxy[] };
  return body.pending ?? [];
}

export async function fetchPrepay(): Promise<{
  remainingUsd: number;
  remainingSzx: string;
} | null> {
  const res = await fetch(`${PROXY_URL}/v1/prepay`);
  if (!res.ok) throw new Error(`prepay ${res.status}`);
  const body = (await res.json()) as {
    prepay: { remainingUsd: number; remainingSzx: string } | null;
  };
  return body.prepay;
}

/** Fund session Prepay with a larger Pay-to-Sink (USD feel units). */
export async function fundPrepay(
  publicKey: string,
  usd: number,
): Promise<{ hash: string; szxAmount: string }> {
  await assertFreighterTestnet();
  const quote = await quoteSzxForUsdFeel(SZX_CONFIG as SzxConfig, usd);
  const requestId = `prepay:${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const server = new Horizon.Server(HORIZON_URL);
  await assertCanPaySzx(server, publicKey, quote.szxAmount);
  const account = await server.loadAccount(publicKey);
  const built = buildPayToSink(SZX_CONFIG as SzxConfig, {
    sourcePublicKey: publicKey,
    sequence: account.sequenceNumber(),
    szxAmount: quote.szxAmount,
    requestId,
  });
  const signed = await signTransaction(built.xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Freighter did not return signed XDR");
  }
  const result = await submitSigned(server, signed.signedTxXdr);
  const settle = await fetch(`${PROXY_URL}/v1/prepay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionHash: result.hash,
      usd,
      szxAmount: quote.szxAmount,
      publicKey,
      requestId,
    }),
  });
  if (!settle.ok) {
    throw new Error(`prepay fund failed: ${settle.status} ${await settle.text()}`);
  }
  return { hash: result.hash, szxAmount: quote.szxAmount };
}

export async function payPending(
  pending: PendingFromProxy,
  publicKey: string,
): Promise<{ hash: string; szxAmount: string }> {
  await assertFreighterTestnet();
  const tier = pending.tier in TIERS ? pending.tier : "balanced";
  const quote = await fetchQuote(tier);
  const server = new Horizon.Server(HORIZON_URL);
  await assertCanPaySzx(server, publicKey, quote.szxAmount);
  const account = await server.loadAccount(publicKey);

  const built = buildPayToSink(SZX_CONFIG as SzxConfig, {
    sourcePublicKey: publicKey,
    sequence: account.sequenceNumber(),
    szxAmount: quote.szxAmount,
    requestId: pending.id,
  });

  const signed = await signTransaction(built.xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Freighter did not return signed XDR");
  }

  const result = await submitSigned(server, signed.signedTxXdr);
  const hash = result.hash;

  const settle = await fetch(`${PROXY_URL}/v1/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: pending.id,
      transactionHash: hash,
      szxAmount: quote.szxAmount,
    }),
  });
  if (!settle.ok) {
    const err = await settle.text();
    throw new Error(`settle failed: ${settle.status} ${err}`);
  }

  return { hash, szxAmount: quote.szxAmount };
}
