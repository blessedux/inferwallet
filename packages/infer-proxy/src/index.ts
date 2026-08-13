/**
 * Infer Proxy — local OpenAI-compatible endpoint (placeholder).
 * Gates OpenRouter on verified SZX Pay-to-Sink settlement.
 */

import { placeholder } from "@inferwallet/sdk";

const PORT = Number(process.env.INFER_PROXY_PORT ?? 8787);

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "infer-proxy",
        sdk: placeholder(),
      });
    }
    return new Response("Infer Proxy scaffold — settlement gate not yet wired", {
      status: 501,
    });
  },
});

console.log(`Infer Proxy listening on http://localhost:${server.port}`);
