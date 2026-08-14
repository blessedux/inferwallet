# Railway Deployment Guide

Deploy the InferWallet proxy to Railway.

## Prerequisites

- Railway account: https://railway.app
- Railway CLI (optional): `npm i -g @railway/cli`

## Setup

### 1. Create Railway Project

```bash
# Via Railway CLI
railway login
railway init --name inferwallet
railway link
```

Or create manually at https://railway.app/new

### 2. Configure Environment Variables

In Railway dashboard → Variables, add:

**Required:**
- `SZX_ISSUER` = `GAUR24CEIVAPOLAVTHYEKAI5VVYAVOHWZ3RJZOTVVFQSJXNAUFXJ4ZQ5`
- `SZX_SINK` = `GCRKN24XQI46JJKGGZLREWQFQGGFV4QNDZG7Q7ZWP4EVV4TRVDOX5LGA`
- `OPENROUTER_API_KEY` = `sk-or-v1-...` (your OpenRouter key)
- `COMPANION_ORIGIN` = `https://inferwallet.vercel.app` (or your companion URL)

**Optional:**
- `SZX_CODE` = `SZX` (default)
- `HORIZON_URL` = `https://horizon-testnet.stellar.org` (default)
- `NETWORK_PASSPHRASE` = `Test SDF Network ; September 2015` (default)
- `SKIP_CHAIN_VERIFY` = `false` (set to `true` for demo mode)
- `SETTLEMENT_TIMEOUT_MS` = `120000` (2 minutes)
- `OPENROUTER_BASE_URL` = `https://openrouter.ai/api/v1` (default)

**Tier Models** (comma-separated, defaults shown):
- `TIER_CHEAP_MODELS` = `google/gemini-2.0-flash-lite-thinking-exp:free`
- `TIER_BALANCED_MODELS` = `anthropic/claude-3.5-sonnet-20241022:beta`
- `TIER_PREMIUM_MODELS` = `anthropic/claude-opus-4-20250514`

**Spend Guards** (per-request/session USD feel limits):
- `GUARD_MAX_REQUEST_FEEL` = `1.0` (default)
- `GUARD_MAX_SESSION_FEEL` = `100.0` (default)

### 3. Deploy

**Via CLI:**
```bash
railway up
```

**Via GitHub:**
1. Connect your repo in Railway dashboard
2. Set root directory to `/`
3. Railway auto-detects `railway.json` config
4. Push to trigger deploy

### 4. Get Your Proxy URL

After deployment, Railway provides a public URL like:
`https://inferwallet-production.up.railway.app`

### 5. Update Vercel Environment Variable

In Vercel dashboard → Settings → Environment Variables:
- Add `VITE_PROXY_URL` = `https://your-railway-url.up.railway.app`
- Redeploy the companion

## Testing

```bash
# Check proxy health
curl https://your-railway-url.up.railway.app/v1/prepay

# Test from companion
# Visit https://inferwallet.vercel.app
# Should now connect to Railway proxy
```

## Monitoring

Railway dashboard shows:
- Logs (stdout/stderr)
- Metrics (CPU, memory, network)
- Deployments history
- Service health

## Troubleshooting

**Build fails:**
- Check Railway logs
- Verify `bun install` succeeds
- Ensure monorepo workspace deps resolve

**Runtime fails:**
- Check environment variables are set
- Verify `SZX_ISSUER` and `SZX_SINK` are correct
- Check `OPENROUTER_API_KEY` is valid

**CORS errors:**
- Ensure `COMPANION_ORIGIN` matches your Vercel URL exactly (no trailing slash)

**Companion can't connect:**
- Verify `VITE_PROXY_URL` in Vercel matches Railway public URL
- Check Railway service is running (not crashed)
- Test proxy endpoint directly with curl

## Production Checklist

- [ ] Set `SKIP_CHAIN_VERIFY=false` (verify real Stellar transactions)
- [ ] Configure appropriate spend guards
- [ ] Set `COMPANION_ORIGIN` to production Vercel URL
- [ ] Update `VITE_PROXY_URL` in Vercel
- [ ] Test swap → load credits → inference flow end-to-end
- [ ] Monitor Railway logs for errors
- [ ] Set up Railway usage alerts
