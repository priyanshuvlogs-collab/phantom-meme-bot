# 👻 Phantom Meme Bot

**Open-source Solana meme coin trading bot** — Jupiter aggregator routing, Phantom wallet support, configurable strategies, on-chain safety filters, and **paper trading by default**.

> TypeScript monorepo: headless strategy engine + CLI + Next.js dashboard, sharing one core library and one SQLite database.

---

## ⚠️ Read this first

**Meme coin trading is gambling with extra steps.** Before you touch this software, understand:

- **Most meme coins go to zero.** Rugs, honeypots, LP pulls, and coordinated dumps are the norm, not the exception. The built-in safety filters catch *common* rug mechanics only — they cannot detect a determined scammer.
- **Bots amplify mistakes.** A bad config can lose money faster than you can react. A bug (in this code, in an API, in an RPC) can too.
- **This is not financial advice** and comes with **no warranty** (MIT license). The authors are not responsible for your losses.
- **Never use your main wallet.** For automation, create a dedicated burner wallet and fund it only with what you can afford to lose completely.
- **Start in paper mode.** It is the default for a reason. Live trading requires you to explicitly set two environment variables acknowledging the risk.

---

## Features

| | |
|---|---|
| 🔄 **Swap engine** | [Jupiter](https://jup.ag) quote + swap APIs — routes across Raydium, Orca, Meteora, Pump.fun and every major Solana venue |
| 👛 **Phantom support** | Interactive: connect Phantom in the dashboard via `@solana/wallet-adapter` (keys never leave the browser). Automation: optional burner-wallet keypair for headless trading |
| 📊 **Positions & PnL** | SQLite-backed position tracking, VWAP entries, realized + unrealized PnL in USD and SOL |
| 🎯 **Strategies** | Take-profit / stop-loss per position · buy-the-dip % · sell-on-rise % (ladder out), all with cooldowns |
| 🛡️ **Safety filters** | Mint authority revoked · freeze authority revoked (honeypot check) · minimum liquidity · top-10 holder concentration — run before **every** buy |
| 📄 **Paper trading** | Default mode. Simulated fills against *real* Jupiter quotes (realistic routing & price impact), virtual SOL balance |
| 🖥️ **CLI + dashboard** | `pmb` CLI for everything; Next.js 15 dashboard with live PnL, trade panel, safety checker, watchlist |
| 🚦 **Risk management** | Max position size · max open positions · daily-loss circuit breaker enforced on every buy from any entry point |
| 🪵 **Ops-ready** | Structured pino logging, retry with backoff, client-side rate limiting, Docker Compose |

## Architecture

```
phantom-meme-bot/
├── apps/
│   ├── cli/                  # `pmb` — commander-based CLI + engine runner
│   └── web/                  # Next.js 15 dashboard (App Router, Tailwind v4)
│       ├── app/api/          # REST endpoints over the core library
│       └── components/       # trade panel, safety screen, positions, watchlist
├── packages/
│   ├── core/                 # everything the apps share
│   │   ├── config.ts         #   zod-validated .env config (fails loud & early)
│   │   ├── db/               #   Drizzle ORM + SQLite (positions, trades, watchlist, kv)
│   │   ├── jupiter/          #   quote / swap / price API client
│   │   ├── prices/           #   polling price service with event emitter
│   │   ├── safety/           #   token safety screen
│   │   ├── trading/          #   TradeExecutor (paper + live), PnL math
│   │   └── wallet/           #   burner keypair loader (live automation only)
│   └── strategies/           # strategy engine + built-in strategies
│       ├── engine.ts         #   interval loop, overlap guard, graceful shutdown
│       ├── takeProfitStopLoss.ts
│       ├── dipBuy.ts
│       └── riseSell.ts
├── docker-compose.yml        # bot + web, shared ./data volume
└── .env.example              # every setting, documented
```

**Key design decisions**

- **One `TradeExecutor` for every entry point** (CLI, dashboard, strategies). Risk caps and safety filters cannot be bypassed by picking a different interface.
- **Paper fills use real Jupiter quotes**, so slippage, routing, and price impact behave like production — the only difference is that no transaction is sent.
- **SQLite + Drizzle** instead of Postgres: zero-config, one file, easy Docker volume. Raw token amounts are stored as strings (base units exceed 2^53).
- **Interval loop instead of BullMQ/Redis**: ticks are cheap and idempotent; one less service to run. Swap in a queue later if you need distributed workers.
- **Two wallet models, strictly separated.** Browser flow: Phantom signs, server never sees a key. Automation flow: a burner keypair read from env at runtime — never hardcoded, never persisted by the bot.

## Quickstart (paper mode — safe)

Requirements: Node 20+, [pnpm](https://pnpm.io) 10+.

```bash
git clone https://github.com/priyanshuvlogs-collab/phantom-meme-bot
cd phantom-meme-bot
pnpm install
cp .env.example .env        # defaults are already safe: TRADING_MODE=paper
pnpm build
```

Try the CLI (BONK used as the example mint):

```bash
# Check config, paper balance, risk limits
pnpm cli status

# Safety-screen a token before anything else
pnpm cli safety DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263

# Paper-buy 0.05 SOL worth, with 50% take profit / 20% stop loss
pnpm cli buy DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 --sol 0.05 --tp 50 --sl 20

# Watch it
pnpm cli positions

# Sell half
pnpm cli sell DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 --pct 50
```

Run the strategy engine (monitors TP/SL for open positions + watchlist rules):

```bash
# Buy 0.05 SOL of BONK whenever it dips 10%, sell 50% whenever it rises 25%
pnpm cli watch add DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 --dip 10 --size 0.05 --rise 25 --portion 50

pnpm bot        # = pmb run; Ctrl+C to stop
```

Launch the dashboard at [http://localhost:3000](http://localhost:3000):

```bash
pnpm web        # dev server; or `pnpm web:build && pnpm web:start`
```

> **Note on the free public RPC:** `api.mainnet-beta.solana.com` blocks the holder-concentration call used by the safety screen, and rate-limits aggressively. For paper testing you can set `SAFETY_ALLOW_UNVERIFIED_TOP_HOLDERS=true`; for anything serious use a dedicated RPC (Helius, Triton, QuickNode) — most have free tiers.

## CLI reference

```
pmb status                        mode, balance, risk usage
pmb price <mints...>              current USD prices (Jupiter)
pmb quote <in> <out> <amount>     route, price impact, min-out for a swap
pmb safety <mint>                 run the safety screen (exit code 1 on fail)
pmb buy <mint> --sol <n>          buy via Jupiter  [--tp % --sl % --slippage bps --skip-safety]
pmb sell <id|mint>                sell a position  [--pct 1-100 --slippage bps]
pmb positions [--all]             positions with live PnL
pmb trades [--limit n]            trade history
pmb watch add <mint>              watchlist rules  [--dip % --size SOL --rise % --portion % --cooldown min]
pmb watch ls | rm <mint>          list / remove watchlist entries
pmb paper reset                   reset the paper balance
pmb run                           start the strategy engine
```

(`pnpm cli <cmd>` from the repo root, or `node apps/cli/dist/main.js <cmd>` after building.)

## Strategies

All strategies run inside the engine (`pmb run`), evaluate on every tick (`STRATEGY_TICK_INTERVAL_MS`), and execute through the same risk-checked executor:

| Strategy | Trigger | Action |
|---|---|---|
| **Take profit / stop loss** | Price vs. your VWAP entry moves past the position's `--tp` / `--sl` thresholds | Close the position |
| **Dip buy** | Price drops `dip%` below a rolling reference price | Buy `size` SOL, reset reference, start cooldown |
| **Rise sell** | Price rises `rise%` above the rolling reference while you hold the token | Sell `portion%` of the position, reset reference (ladder out) |

Exits run before entries each tick so freed capital/slots are usable immediately. Failed exits retry on the next tick. Writing your own strategy = implementing a two-method interface (`requiredMints()`, `tick(ctx)`) in `packages/strategies`.

## Safety filters

Every buy (CLI, dashboard, or strategy) is screened first — unless you pass `--skip-safety`, which you shouldn't:

1. **Mint authority revoked** — otherwise the deployer can print infinite supply.
2. **Freeze authority revoked** — otherwise the deployer can freeze your token account: you can buy but never sell (classic honeypot).
3. **Liquidity ≥ `SAFETY_MIN_LIQUIDITY_USD`** — thin pools mean brutal price impact and cheap rugs (data: DexScreener).
4. **Top-10 holders ≤ `SAFETY_MAX_TOP10_HOLDER_PCT`** — concentrated float can dump on you at will. Note: LP vaults count toward this figure, so 20–40% is common for healthy tokens.

A failing report blocks the buy and tells you exactly which check failed and why it matters. **Passing does not mean safe.**

## The dashboard

- **Stat cards** — paper balance, open position value, unrealized/realized PnL, SOL price, daily-loss meter
- **Trade panel** — two flows: **Bot** (paper simulation, or server-side live via burner key) and **Phantom** (connect your wallet, sign in the browser — real funds, clearly marked red)
- **Token safety screen** — paste a mint, get the checklist
- **Positions table** — live PnL, one-click sell 50% / sell all
- **Watchlist panel** — manage dip-buy / rise-sell rules
- **Trade history** — every trade with its trigger reason (manual / take_profit / stop_loss / dip_buy / rise_sell) and Solscan link for live trades

## Going live (only after serious paper testing)

1. **Create a burner wallet:** `solana-keygen new -o burner.json` (or export a *dedicated new* wallet from Phantom). Fund it with a small amount of SOL.
2. Point the bot at it in `.env` — path preferred over raw key:
   ```ini
   WALLET_KEYPAIR_PATH=./burner.json
   ```
3. Use a **dedicated RPC provider** and (recommended) a [Jupiter API key](https://portal.jup.ag).
4. Set conservative risk caps (`MAX_POSITION_SIZE_SOL`, `MAX_DAILY_LOSS_SOL` — the bot halts new buys for the day when realized losses hit this).
5. Explicitly opt in:
   ```ini
   TRADING_MODE=live
   LIVE_TRADING_ACKNOWLEDGED=true
   ```
   The bot refuses to start live without the acknowledgement flag.

Key handling rules baked into the codebase: keys are read from the environment at runtime only, never hardcoded, never written to disk or database, never sent to the dashboard. The interactive Phantom flow never exposes a key to the server at all. `.gitignore` excludes `.env` and `*.keypair.json`.

## Docker

```bash
cp .env.example .env      # edit as needed
docker compose up --build
```

- `bot` — the strategy engine (paper mode unless your `.env` says otherwise)
- `web` — dashboard on [http://localhost:3000](http://localhost:3000)
- Both share `./data/bot.db` via a bind mount; logs are JSON for easy shipping.

## Configuration

Everything lives in `.env` (see [.env.example](.env.example) for full docs). Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `TRADING_MODE` | `paper` | `paper` (simulated) or `live` (real funds) |
| `LIVE_TRADING_ACKNOWLEDGED` | `false` | must be `true` for live mode — deliberate speed bump |
| `PAPER_STARTING_BALANCE_SOL` | `10` | virtual balance for paper trading |
| `SOLANA_RPC_URL` | public mainnet | use a dedicated provider for real usage |
| `JUPITER_API_BASE_URL` | `https://lite-api.jup.ag` | free tier; `https://api.jup.ag` with `JUPITER_API_KEY` |
| `SLIPPAGE_BPS` | `100` | 1% default slippage |
| `MAX_POSITION_SIZE_SOL` | `0.1` | hard cap per buy |
| `MAX_OPEN_POSITIONS` | `5` | hard cap on concurrent positions |
| `MAX_DAILY_LOSS_SOL` | `0.5` | circuit breaker: halts new buys for the day |
| `DEFAULT_TAKE_PROFIT_PCT` / `DEFAULT_STOP_LOSS_PCT` | `50` / `20` | applied to buys without explicit `--tp/--sl` |
| `SAFETY_MIN_LIQUIDITY_USD` | `20000` | liquidity floor |
| `SAFETY_MAX_TOP10_HOLDER_PCT` | `40` | holder concentration ceiling |
| `PRICE_POLL_INTERVAL_MS` / `STRATEGY_TICK_INTERVAL_MS` | `5000` / `10000` | engine timing |

## Development

```bash
pnpm build        # compile all packages
pnpm test         # vitest unit tests (PnL math, strategy decisions)
pnpm typecheck    # strict TS across the workspace
```

## Known limitations (MVP)

- **Recorded fills use quote amounts.** Live fills can differ within slippage bounds; reconciling against on-chain balances post-confirmation is a natural next step.
- **Wallet-signed dashboard trades** are recorded from the accepted quote, and TP/SL automation for them requires the engine + a burner key (the engine can't sign with your Phantom wallet).
- **Price data is polled** (default 5s), not streamed. Fast rugs can outrun a stop loss — as they would on any DEX bot without private mempool access.
- **Paper mode doesn't model** MEV/sandwiches, priority-fee auctions, or failed-transaction costs.

## License

[MIT](LICENSE) — do whatever you want, at your own risk. Seriously: **only trade what you can afford to lose.**
