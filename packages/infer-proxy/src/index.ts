/**
 * Infer Proxy — local OpenAI-compatible endpoint.
 * Gates completions on verified SZX Pay-to-Sink settlement.
 */

import { createProxyHandler, loadConfigFromEnv } from "./server.js";

const config = loadConfigFromEnv();
const handler = createProxyHandler({ config });

const server = Bun.serve({
  port: config.port,
  fetch: handler,
});

console.log(`Infer Proxy listening on http://localhost:${server.port}`);
console.log(`Companion origin: ${config.companionOrigin}`);
console.log(
  `Chain verify: ${config.skipChainVerify || !config.szx ? "skipped/demo" : "horizon"}`,
);
