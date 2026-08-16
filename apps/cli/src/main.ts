#!/usr/bin/env node
import { PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import {
  SOL_MINT,
  checkTokenSafety,
  computePositionPnl,
  getAllPositions,
  getConnection,
  getDailyRealizedLossSol,
  getJupiterClient,
  getMintDecimals,
  getOpenPositions,
  getPaperBalanceLamports,
  getRecentTrades,
  getTokenMarketInfo,
  getWatchlist,
  lamportsToSol,
  loadConfig,
  rawToUi,
  removeWatchlistItem,
  resetPaperBalance,
  TradeExecutor,
  tryGetSignerPublicKey,
  uiToRaw,
  upsertWatchlistItem,
} from "@phantom-meme-bot/core";
import { StrategyEngine } from "@phantom-meme-bot/strategies";
import { fmtPct, fmtSigned, fmtSol, fmtUsd, modeBadge, shortAddr } from "./format.js";

const program = new Command();

program
  .name("pmb")
  .description(
    "Phantom Meme Bot — Solana meme coin trading via Jupiter.\n" +
      chalk.yellow(
        "⚠  Meme coins are extremely high risk. Paper mode is the default; live mode can lose everything you deploy.",
      ),
  )
  .version("0.1.0");

function banner(): void {
  const config = loadConfig();
  console.log(`\n${modeBadge(config.TRADING_MODE)} phantom-meme-bot\n`);
  if (!config.isPaper) {
    console.log(
      chalk.red.bold("  LIVE MODE — real transactions will be sent with real funds.\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
program
  .command("status")
  .description("Show mode, balance, risk usage and engine info")
  .action(async () => {
    const config = loadConfig();
    banner();
    if (config.isPaper) {
      console.log(`  Paper balance: ${chalk.bold(fmtSol(lamportsToSol(getPaperBalanceLamports())))}`);
    } else {
      const pubkey = tryGetSignerPublicKey();
      if (pubkey) {
        const balance = await getConnection().getBalance(new PublicKey(pubkey));
        console.log(`  Wallet: ${pubkey}`);
        console.log(`  Balance: ${chalk.bold(fmtSol(lamportsToSol(balance)))}`);
      } else {
        console.log(chalk.yellow("  No signer configured (interactive Phantom mode only)."));
      }
    }
    const open = getOpenPositions(config.TRADING_MODE);
    console.log(`  Open positions: ${open.length}/${config.MAX_OPEN_POSITIONS}`);
    console.log(
      `  Daily realized loss: ${fmtSol(getDailyRealizedLossSol())} (halt at ${fmtSol(config.MAX_DAILY_LOSS_SOL)})`,
    );
    console.log(`  Max position size: ${fmtSol(config.MAX_POSITION_SIZE_SOL)}`);
    console.log(`  RPC: ${config.SOLANA_RPC_URL}`);
    console.log(`  Jupiter: ${config.JUPITER_API_BASE_URL}\n`);
  });

// ---------------------------------------------------------------------------
// price
// ---------------------------------------------------------------------------
program
  .command("price")
  .description("Current USD price(s) for one or more mints")
  .argument("<mints...>", "token mint addresses")
  .action(async (mints: string[]) => {
    const prices = await getJupiterClient().getUsdPrices(mints);
    for (const mint of mints) {
      console.log(`${shortAddr(mint)}  ${fmtUsd(prices.get(mint))}`);
    }
  });

// ---------------------------------------------------------------------------
// quote
// ---------------------------------------------------------------------------
program
  .command("quote")
  .description("Get a Jupiter swap quote (UI amounts)")
  .argument("<inputMint>", "input mint (use SOL for native)")
  .argument("<outputMint>", "output mint")
  .argument("<amount>", "input amount in UI units")
  .option("--slippage <bps>", "slippage in bps")
  .action(async (inputMintArg: string, outputMintArg: string, amountStr: string, opts) => {
    const inputMint = inputMintArg === "SOL" ? SOL_MINT : inputMintArg;
    const outputMint = outputMintArg === "SOL" ? SOL_MINT : outputMintArg;
    const [inDec, outDec] = await Promise.all([
      getMintDecimals(inputMint),
      getMintDecimals(outputMint),
    ]);
    const quote = await getJupiterClient().getQuote({
      inputMint,
      outputMint,
      amountRaw: uiToRaw(Number(amountStr), inDec),
      slippageBps: opts.slippage ? Number(opts.slippage) : undefined,
    });
    console.log(`\n  In:  ${rawToUi(quote.inAmount, inDec)} ${shortAddr(inputMint)}`);
    console.log(`  Out: ${chalk.bold(String(rawToUi(quote.outAmount, outDec)))} ${shortAddr(outputMint)}`);
    console.log(`  Min out (slippage ${quote.slippageBps} bps): ${rawToUi(quote.otherAmountThreshold, outDec)}`);
    console.log(`  Price impact: ${Number(quote.priceImpactPct) * 100 < 0.01 ? "<0.01" : (Number(quote.priceImpactPct) * 100).toFixed(2)}%`);
    console.log(
      `  Route: ${quote.routePlan.map((s) => s.swapInfo.label ?? "?").join(" → ") || "direct"}\n`,
    );
  });

// ---------------------------------------------------------------------------
// safety
// ---------------------------------------------------------------------------
program
  .command("safety")
  .description("Run the token safety screen (mint/freeze authority, holders, liquidity)")
  .argument("<mint>", "token mint address")
  .action(async (mint: string) => {
    const report = await checkTokenSafety(mint);
    console.log(`\n  ${chalk.bold(report.symbol)} — ${report.name}`);
    console.log(`  ${report.mint}\n`);
    for (const check of report.checks) {
      const icon = check.passed ? chalk.green("✔") : chalk.red("✘");
      console.log(`  ${icon} ${check.label}: ${chalk.bold(check.value)}`);
      if (check.detail) console.log(chalk.gray(`      ${check.detail}`));
    }
    console.log(
      `\n  Overall: ${report.passed ? chalk.green.bold("PASSED") : chalk.red.bold("FAILED")}`,
    );
    console.log(
      chalk.gray("  Passing these checks does NOT make a token safe — it only filters the most common rug mechanics.\n"),
    );
    process.exitCode = report.passed ? 0 : 1;
  });

// ---------------------------------------------------------------------------
// buy / sell
// ---------------------------------------------------------------------------
program
  .command("buy")
  .description("Buy a token with SOL via Jupiter (paper or live depending on TRADING_MODE)")
  .argument("<mint>", "token mint address")
  .requiredOption("--sol <amount>", "SOL to spend")
  .option("--tp <pct>", "take profit % (default from .env)")
  .option("--sl <pct>", "stop loss % (default from .env)")
  .option("--slippage <bps>", "slippage in bps")
  .option("--skip-safety", "skip the safety screen (NOT recommended)", false)
  .action(async (mint: string, opts) => {
    banner();
    const executor = new TradeExecutor();
    const result = await executor.buy({
      mint,
      solAmount: Number(opts.sol),
      takeProfitPct: opts.tp != null ? Number(opts.tp) : undefined,
      stopLossPct: opts.sl != null ? Number(opts.sl) : undefined,
      slippageBps: opts.slippage ? Number(opts.slippage) : undefined,
      skipSafety: Boolean(opts.skipSafety),
    });
    const pos = result.position;
    console.log(
      `  ${chalk.green("Bought")} ${rawToUi(result.trade.outAmountRaw, pos.decimals).toLocaleString()} ${pos.symbol} for ${fmtSol(lamportsToSol(result.trade.inAmountRaw))}`,
    );
    console.log(`  Entry price: ${fmtUsd(result.trade.priceUsd ?? undefined)}`);
    console.log(`  Position: ${pos.id} (TP ${pos.takeProfitPct ?? "—"}% / SL ${pos.stopLossPct ?? "—"}%)`);
    if (result.txSignature) console.log(`  Tx: https://solscan.io/tx/${result.txSignature}`);
    console.log();
  });

program
  .command("sell")
  .description("Sell an open position (by position id or mint)")
  .argument("<positionIdOrMint>")
  .option("--pct <pct>", "portion to sell (1-100)", "100")
  .option("--slippage <bps>", "slippage in bps")
  .action(async (idOrMint: string, opts) => {
    banner();
    const executor = new TradeExecutor();
    const result = await executor.sell({
      positionIdOrMint: idOrMint,
      portionPct: Number(opts.pct),
      slippageBps: opts.slippage ? Number(opts.slippage) : undefined,
    });
    console.log(
      `  ${chalk.green("Sold")} ${rawToUi(result.trade.inAmountRaw, result.position.decimals).toLocaleString()} ${result.position.symbol} for ${fmtSol(lamportsToSol(result.trade.outAmountRaw))}`,
    );
    console.log(`  Realized PnL (position total): ${fmtSigned(result.position.realizedPnlSol, "SOL")}`);
    if (result.txSignature) console.log(`  Tx: https://solscan.io/tx/${result.txSignature}`);
    console.log();
  });

// ---------------------------------------------------------------------------
// positions / trades
// ---------------------------------------------------------------------------
program
  .command("positions")
  .description("List positions with live PnL")
  .option("--all", "include closed positions", false)
  .action(async (opts) => {
    banner();
    const positions = opts.all ? getAllPositions() : getOpenPositions();
    if (positions.length === 0) {
      console.log(chalk.gray("  No positions.\n"));
      return;
    }
    const openMints = [...new Set(positions.filter((p) => p.status === "open").map((p) => p.mint))];
    const prices =
      openMints.length > 0 ? await getJupiterClient().getUsdPrices(openMints) : new Map<string, number>();

    const table = new Table({
      head: ["Symbol", "Status", "Amount", "Entry", "Now", "PnL %", "PnL $", "Realized SOL", "TP/SL", "Id"],
      style: { head: ["cyan"] },
    });
    for (const position of positions) {
      const pnl = computePositionPnl(position, prices.get(position.mint));
      table.push([
        position.symbol,
        position.status === "open" ? chalk.green("open") : chalk.gray("closed"),
        pnl.tokenAmountUi.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        fmtUsd(position.entryPriceUsd),
        fmtUsd(pnl.currentPriceUsd),
        fmtPct(pnl.unrealizedPnlPct),
        pnl.unrealizedPnlUsd !== undefined ? fmtSigned(pnl.unrealizedPnlUsd, "$", 2) : chalk.gray("—"),
        fmtSigned(position.realizedPnlSol, ""),
        `${position.takeProfitPct ?? "—"}/${position.stopLossPct ?? "—"}`,
        shortAddr(position.id),
      ]);
    }
    console.log(table.toString());
    console.log();
  });

program
  .command("trades")
  .description("Recent trade history")
  .option("--limit <n>", "max rows", "25")
  .action((opts) => {
    banner();
    const trades = getRecentTrades(Number(opts.limit));
    if (trades.length === 0) {
      console.log(chalk.gray("  No trades yet.\n"));
      return;
    }
    const table = new Table({
      head: ["Time", "Side", "Symbol", "Reason", "Status", "Price", "Tx"],
      style: { head: ["cyan"] },
    });
    for (const trade of trades) {
      table.push([
        trade.createdAt.toISOString().replace("T", " ").slice(0, 19),
        trade.side === "buy" ? chalk.green("buy") : chalk.red("sell"),
        trade.symbol,
        trade.reason,
        trade.status === "failed" ? chalk.red(trade.status) : trade.status,
        fmtUsd(trade.priceUsd ?? undefined),
        trade.txSignature ? shortAddr(trade.txSignature) : chalk.gray("paper"),
      ]);
    }
    console.log(table.toString());
    console.log();
  });

// ---------------------------------------------------------------------------
// watch (dip-buy / rise-sell rules)
// ---------------------------------------------------------------------------
const watch = program.command("watch").description("Manage the watchlist for dip-buy / rise-sell strategies");

watch
  .command("add")
  .description("Add or update a watchlist token")
  .argument("<mint>")
  .option("--dip <pct>", "buy when price drops this % below reference")
  .option("--size <sol>", "SOL per dip buy")
  .option("--rise <pct>", "sell when price rises this % above reference")
  .option("--portion <pct>", "portion of position to sell on rise", "100")
  .option("--cooldown <minutes>", "minimum minutes between triggers", "5")
  .action(async (mint: string, opts) => {
    if (opts.dip && !opts.size) {
      console.error(chalk.red("  --dip requires --size (SOL amount per buy)"));
      process.exitCode = 1;
      return;
    }
    const [decimals, market] = await Promise.all([
      getMintDecimals(mint),
      getTokenMarketInfo(mint).catch(() => undefined),
    ]);
    const item = upsertWatchlistItem({
      mint,
      symbol: market?.symbol ?? "?",
      decimals,
      enabled: true,
      dipBuyPct: opts.dip != null ? Number(opts.dip) : null,
      dipBuySizeSol: opts.size != null ? Number(opts.size) : null,
      riseSellPct: opts.rise != null ? Number(opts.rise) : null,
      riseSellPortionPct: Number(opts.portion),
      cooldownMs: Number(opts.cooldown) * 60_000,
    });
    console.log(
      `  Watching ${chalk.bold(item.symbol)} — dip ${item.dipBuyPct ?? "—"}% (${item.dipBuySizeSol ?? "—"} SOL), rise ${item.riseSellPct ?? "—"}% (${item.riseSellPortionPct ?? 100}% of position)`,
    );
  });

watch
  .command("ls")
  .description("List watchlist entries")
  .action(() => {
    const items = getWatchlist();
    if (items.length === 0) {
      console.log(chalk.gray("  Watchlist is empty. Add tokens with `pmb watch add <mint> --dip 10 --size 0.05`."));
      return;
    }
    const table = new Table({
      head: ["Symbol", "Mint", "Enabled", "Ref price", "Dip %", "Size SOL", "Rise %", "Portion %"],
      style: { head: ["cyan"] },
    });
    for (const item of items) {
      table.push([
        item.symbol,
        shortAddr(item.mint),
        item.enabled ? chalk.green("yes") : chalk.gray("no"),
        fmtUsd(item.referencePriceUsd ?? undefined),
        item.dipBuyPct ?? "—",
        item.dipBuySizeSol ?? "—",
        item.riseSellPct ?? "—",
        item.riseSellPortionPct ?? "—",
      ]);
    }
    console.log(table.toString());
  });

watch
  .command("rm")
  .description("Remove a token from the watchlist")
  .argument("<mint>")
  .action((mint: string) => {
    removeWatchlistItem(mint);
    console.log(`  Removed ${shortAddr(mint)} from watchlist.`);
  });

// ---------------------------------------------------------------------------
// paper utilities
// ---------------------------------------------------------------------------
const paper = program.command("paper").description("Paper trading utilities");
paper
  .command("reset")
  .description("Reset the paper balance to PAPER_STARTING_BALANCE_SOL")
  .action(() => {
    const balance = resetPaperBalance();
    console.log(`  Paper balance reset to ${fmtSol(lamportsToSol(balance))}`);
  });

// ---------------------------------------------------------------------------
// run (strategy engine)
// ---------------------------------------------------------------------------
program
  .command("run")
  .description("Start the strategy engine (TP/SL + rise-sell + dip-buy loop)")
  .action(async () => {
    banner();
    const engine = new StrategyEngine();
    const shutdown = () => {
      engine.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    await engine.start();
    console.log(chalk.gray("  Engine running. Press Ctrl+C to stop.\n"));
    // Keep the process alive.
    await new Promise(() => {});
  });

program.parseAsync().catch((err: unknown) => {
  console.error(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
