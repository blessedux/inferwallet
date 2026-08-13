# Operator spend guards

Infer Proxy protections that sit **on top of** payment-gated forwarding.

## Daily USD ceiling

Env: `DAILY_USD_CEILING` (default `50`).

Sums Fixed USD Feel for successfully forwarded requests (UTC day). Crossing the
ceiling returns HTTP `429` with `code: daily_ceiling` until the next UTC day or
you raise the env and restart.

## Kill switch

Either:

- Env: `KILL_SWITCH=1` (or `true` / `on`)
- File: set `KILL_SWITCH_FILE=/path/to/kill` and create that file (`touch` it, or write `1`/`true`/`on`)

When armed, the proxy rejects OpenRouter forwarding with `429` / `code: kill_switch`
even if Pay-to-Sink or Prepay is valid.

`/health` includes a `guards` snapshot (`spentUsd`, `ceiling`, `killSwitch`).

## Example

```bash
DAILY_USD_CEILING=25
# emergency:
KILL_SWITCH=1
# or:
KILL_SWITCH_FILE=./.kill-switch
touch ./.kill-switch
```
