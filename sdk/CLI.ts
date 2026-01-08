#!/usr/bin/env node
/**
 * Scale AMM Interactive CLI
 *
 * Launch tokens in under 60 seconds with ZERO blockchain knowledge.
 *
 * Usage:
 *   npx @scale-amm/sdk launch    # Interactive token launch
 *   npx @scale-amm/sdk buy       # Buy tokens
 *   npx @scale-amm/sdk info      # Get pool info
 *   npx @scale-amm/sdk price     # Check price
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ScaleAMM } from './ScaleAMM';
import { ScaleUtils, SCALE_CONSTANTS } from './ScaleUtils';
import { ScaleError } from './errors';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function loadWallet(): Keypair {
  const walletPath = process.env.SOLANA_WALLET || path.join(process.env.HOME!, '.config/solana/id.json');

  if (!fs.existsSync(walletPath)) {
    console.error(chalk.red('❌ Wallet not found. Set SOLANA_WALLET environment variable or create ~/.config/solana/id.json'));
    process.exit(1);
  }

  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

function getConnection(network: 'mainnet' | 'devnet' = 'mainnet'): Connection {
  const rpcUrl = network === 'mainnet'
    ? process.env.SOLANA_RPC_URL || SCALE_CONSTANTS.MAINNET_RPC
    : SCALE_CONSTANTS.DEVNET_RPC;

  return new Connection(rpcUrl, 'confirmed');
}

function printSuccess(message: string) {
  console.log(chalk.green('✓'), message);
}

function printError(message: string) {
  console.log(chalk.red('✗'), message);
}

function printInfo(label: string, value: any) {
  console.log(chalk.cyan(label + ':'), chalk.white(value));
}

// ============================================================================
// COMMAND: LAUNCH TOKEN
// ============================================================================

async function launchToken() {
  console.log(chalk.bold.blue('\n🚀 Scale AMM Token Launch\n'));
  console.log(chalk.dim('Launch your token in under 60 seconds\n'));

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenMint',
      message: 'Token mint address:',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'number',
      name: 'supply',
      message: 'Token supply (e.g., 1000000 for 1M):',
      default: 1_000_000,
      validate: (input) => input > 0 || 'Supply must be positive',
    },
    {
      type: 'number',
      name: 'initialMC',
      message: 'Initial market cap in USD (e.g., 10000 for $10k):',
      default: 10_000,
      validate: (input) => {
        if (input < SCALE_CONSTANTS.MIN_MARKET_CAP) return `Minimum $${SCALE_CONSTANTS.MIN_MARKET_CAP}`;
        if (input > SCALE_CONSTANTS.MAX_MARKET_CAP) return `Maximum $${SCALE_CONSTANTS.MAX_MARKET_CAP}`;
        return true;
      },
    },
    {
      type: 'number',
      name: 'graduationMC',
      message: 'Graduation market cap in USD (e.g., 40000 for $40k):',
      default: 40_000,
      validate: (input) => {
        if (input < SCALE_CONSTANTS.MIN_GRADUATION) return `Minimum $${SCALE_CONSTANTS.MIN_GRADUATION}`;
        if (input > SCALE_CONSTANTS.MAX_GRADUATION) return `Maximum $${SCALE_CONSTANTS.MAX_GRADUATION}`;
        return true;
      },
    },
    {
      type: 'list',
      name: 'fee',
      message: 'Creator fee (you earn this on every trade):',
      choices: [
        { name: '0% - No fees (maximum trading)', value: 0 },
        { name: '0.25% - Low fees (recommended)', value: 25 },
        { name: '1% - High fees (maximum earnings)', value: 100 },
      ],
      default: 0,
    },
    {
      type: 'list',
      name: 'curve',
      message: 'Bonding curve type:',
      choices: [
        { name: 'Constant Product - Standard (like Uniswap)', value: 'ConstantProduct' },
        { name: 'Exponential - Steeper (faster price discovery)', value: 'Exponential' },
      ],
      default: 'ConstantProduct',
    },
    {
      type: 'list',
      name: 'network',
      message: 'Network:',
      choices: [
        { name: 'Devnet (testing)', value: 'devnet' },
        { name: 'Mainnet (production)', value: 'mainnet' },
      ],
      default: 'devnet',
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: (answers: any) => {
        return chalk.yellow(
          `\n📊 Launch Summary:\n` +
          `  Token: ${answers.tokenMint}\n` +
          `  Supply: ${answers.supply.toLocaleString()} tokens\n` +
          `  Initial MC: $${answers.initialMC.toLocaleString()}\n` +
          `  Graduation: $${answers.graduationMC.toLocaleString()}\n` +
          `  Fee: ${answers.fee / 100}%\n` +
          `  Curve: ${answers.curve}\n` +
          `  Network: ${answers.network}\n\n` +
          `Proceed with launch?`
        );
      },
      default: false,
    },
  ]);

  if (!answers.confirm) {
    console.log(chalk.yellow('\nLaunch cancelled.'));
    process.exit(0);
  }

  // Execute launch
  const spinner = ora('Creating pool...').start();

  try {
    const connection = getConnection(answers.network);
    const wallet = loadWallet();
    const scale = new ScaleAMM(connection, wallet);

    const pool = await scale.createPool({
      baseMint: new PublicKey(answers.tokenMint),
      supply: answers.supply,
      initialMarketCapUsd: answers.initialMC,
      graduationThresholdUsd: answers.graduationMC,
      feeBps: answers.fee,
      curveType: answers.curve,
    });

    spinner.succeed('Pool created successfully!');

    console.log(chalk.bold.green('\n🎉 Token Launched Successfully!\n'));
    printInfo('Pool Address', pool.address.toBase58());
    printInfo('Initial Price', `${pool.initialPrice.toFixed(8)} CRX per token`);
    printInfo('Market Cap', ScaleUtils.formatMarketCap(pool.marketCapUsd));
    printInfo('Liquidity', `${pool.liquidityCrx.toFixed(2)} CRX`);
    printInfo('Fee', `${pool.feeBps / 100}%`);
    printInfo('Curve Type', pool.curveType);
    printInfo('Phase', pool.phase);
    printInfo('Graduation Target', ScaleUtils.formatMarketCap(pool.targetMarketCapUsd));

    console.log(chalk.bold.cyan('\n🔗 Trade URL:'));
    console.log(chalk.underline.blue(pool.url));

    console.log(chalk.dim('\n💡 Tip: Share the trade URL with your community to start trading!'));

  } catch (error) {
    spinner.fail('Launch failed');

    if (error instanceof ScaleError) {
      printError(`${error.code}: ${error.message}`);

      if (error.code === 'MINT_AUTHORITY_NOT_REVOKED') {
        console.log(chalk.yellow('\n💡 Fix: Run this command to revoke mint authority:'));
        console.log(chalk.cyan(`spl-token authorize ${answers.tokenMint} mint --disable`));
      }
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }

    process.exit(1);
  }
}

// ============================================================================
// COMMAND: BUY TOKENS
// ============================================================================

async function buyTokens() {
  console.log(chalk.bold.blue('\n💰 Buy Tokens\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'pool',
      message: 'Pool address:',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'number',
      name: 'amount',
      message: 'CRX amount to spend:',
      validate: (input) => input > 0 || 'Amount must be positive',
    },
    {
      type: 'number',
      name: 'slippage',
      message: 'Slippage tolerance (%):',
      default: 1.0,
      validate: (input) => {
        if (input < 0.1) return 'Minimum 0.1%';
        if (input > 50) return 'Maximum 50%';
        return true;
      },
    },
    {
      type: 'list',
      name: 'network',
      message: 'Network:',
      choices: ['devnet', 'mainnet'],
      default: 'devnet',
    },
  ]);

  const spinner = ora('Estimating trade...').start();

  try {
    const connection = getConnection(answers.network);
    const wallet = loadWallet();
    const scale = new ScaleAMM(connection, wallet);
    const poolAddress = new PublicKey(answers.pool);

    // Estimate first
    const estimate = await scale.estimateBuy(poolAddress, answers.amount);
    spinner.succeed('Estimate ready');

    console.log(chalk.bold('\n📊 Trade Preview:\n'));
    printInfo('You pay', `${answers.amount} CRX`);
    printInfo('You receive', `~${estimate.output.toFixed(6)} tokens`);
    printInfo('Fee', `${estimate.fee.toFixed(6)} CRX`);
    printInfo('Price impact', `${estimate.priceImpact.toFixed(2)}%`);
    printInfo('New price', `${estimate.newPrice.toFixed(8)} CRX per token`);

    if (estimate.priceImpact > 10) {
      console.log(chalk.yellow('\n⚠️  Warning: High price impact! Consider reducing trade size.'));
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Execute trade?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\nTrade cancelled.'));
      return;
    }

    spinner.start('Executing buy...');

    const result = await scale.buy(poolAddress, {
      crxAmount: answers.amount,
      slippage: answers.slippage,
    });

    spinner.succeed('Buy executed successfully!');

    console.log(chalk.bold.green('\n✅ Trade Complete!\n'));
    printInfo('Signature', result.signature);
    printInfo('Tokens received', result.tokensReceived?.toFixed(6));
    printInfo('Fee paid', `${result.fee.toFixed(6)} CRX`);
    printInfo('New price', `${result.newPrice.toFixed(8)} CRX per token`);
    printInfo('Price impact', `${result.priceImpact.toFixed(2)}%`);

    if (result.graduated) {
      console.log(chalk.bold.magenta('\n🎉 Pool just graduated to permanent AMM!'));
    }

    console.log(chalk.dim('\n🔗 View on Explorer:'));
    console.log(chalk.underline.blue(ScaleUtils.getExplorerUrl(result.signature, answers.network)));

  } catch (error) {
    spinner.fail('Trade failed');

    if (error instanceof ScaleError) {
      printError(`${error.code}: ${error.message}`);
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }

    process.exit(1);
  }
}

// ============================================================================
// COMMAND: POOL INFO
// ============================================================================

async function poolInfo() {
  console.log(chalk.bold.blue('\n📊 Pool Information\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenMint',
      message: 'Token mint address:',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'list',
      name: 'network',
      message: 'Network:',
      choices: ['devnet', 'mainnet'],
      default: 'devnet',
    },
  ]);

  const spinner = ora('Fetching pool data...').start();

  try {
    const connection = getConnection(answers.network);
    const wallet = loadWallet();
    const scale = new ScaleAMM(connection, wallet);

    const pool = await scale.getPool(new PublicKey(answers.tokenMint));
    spinner.succeed('Pool data loaded');

    console.log(chalk.bold('\n📊 Pool Details:\n'));

    console.log(chalk.bold.cyan('Basic Info:'));
    printInfo('  Pool Address', pool.address.toBase58());
    printInfo('  Base Token', pool.baseMint.toBase58());
    printInfo('  Quote Token', pool.quoteMint.toBase58());
    printInfo('  Creator', pool.creator.toBase58());
    printInfo('  Phase', pool.phase);
    printInfo('  Curve Type', pool.curveType);
    printInfo('  Created', pool.createdAt.toLocaleString());

    console.log(chalk.bold.cyan('\n💰 Market Data:'));
    printInfo('  Current Price', `${ScaleUtils.formatPrice(pool.price)} CRX per token`);
    printInfo('  Market Cap', ScaleUtils.formatMarketCap(pool.marketCapUsd));
    printInfo('  Total Volume', `${pool.volumeCrx.toFixed(2)} CRX`);

    console.log(chalk.bold.cyan('\n💧 Liquidity:'));
    printInfo('  CRX Reserves', `${pool.liquidityCrx.toFixed(2)} CRX`);
    printInfo('  Token Reserves', `${pool.liquidityTokens.toFixed(2)} tokens`);

    console.log(chalk.bold.cyan('\n📈 Graduation:'));
    printInfo('  Target MC', ScaleUtils.formatMarketCap(pool.targetMarketCapUsd));
    printInfo('  Progress', `${pool.graduationProgress.toFixed(1)}%`);
    printInfo('  CRX Needed', `${pool.graduationThresholdCrx.toFixed(2)} CRX`);

    const progressBar = '█'.repeat(Math.floor(pool.graduationProgress / 5)) +
                       '░'.repeat(20 - Math.floor(pool.graduationProgress / 5));
    console.log(chalk.cyan('  [' + progressBar + ']'));

    console.log(chalk.bold.cyan('\n💸 Fees:'));
    printInfo('  Trading Fee', `${pool.feeBps / 100}%`);

    console.log(chalk.bold.cyan('\n🔗 Links:'));
    console.log(chalk.blue('  Trade: ') + chalk.underline(pool.url));
    console.log(chalk.blue('  Pool: ') + chalk.underline(ScaleUtils.getExplorerUrl(pool.address.toBase58(), answers.network)));

  } catch (error) {
    spinner.fail('Failed to fetch pool data');

    if (error instanceof ScaleError) {
      printError(`${error.code}: ${error.message}`);
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }

    process.exit(1);
  }
}

// ============================================================================
// COMMAND: CHECK PRICE
// ============================================================================

async function checkPrice() {
  console.log(chalk.bold.blue('\n💵 Price Check\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'pool',
      message: 'Pool address:',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'list',
      name: 'network',
      message: 'Network:',
      choices: ['devnet', 'mainnet'],
      default: 'devnet',
    },
    {
      type: 'confirm',
      name: 'watch',
      message: 'Watch for real-time updates?',
      default: false,
    },
  ]);

  const connection = getConnection(answers.network);
  const wallet = loadWallet();
  const scale = new ScaleAMM(connection, wallet);
  const poolAddress = new PublicKey(answers.pool);

  const displayPrice = async () => {
    try {
      const price = await scale.getPrice(poolAddress);

      console.clear();
      console.log(chalk.bold.blue('💵 Real-Time Price\n'));
      console.log(chalk.bold.cyan('Pool:'), chalk.white(poolAddress.toBase58()));
      console.log(chalk.bold.cyan('Time:'), chalk.white(new Date().toLocaleTimeString()));
      console.log();
      console.log(chalk.bold.green('Price:'), chalk.bold.white(`${ScaleUtils.formatPrice(price.price)} CRX per token`));
      console.log(chalk.bold.green('Market Cap:'), chalk.bold.white(ScaleUtils.formatMarketCap(price.marketCapUsd)));
      console.log(chalk.bold.green('Liquidity:'), chalk.bold.white(`${price.liquidityCrx.toFixed(2)} CRX`));
      console.log(chalk.bold.green('Phase:'), chalk.bold.white(price.phase));

      if (!answers.watch) {
        console.log(chalk.dim('\n💡 Tip: Use --watch flag to monitor real-time price changes'));
      }
    } catch (error) {
      printError('Failed to fetch price');
      process.exit(1);
    }
  };

  if (answers.watch) {
    console.log(chalk.yellow('Watching for price updates... (Press Ctrl+C to stop)\n'));

    // Display initial price
    await displayPrice();

    // Listen to trades
    scale.onTrade(poolAddress, async () => {
      await displayPrice();
    });

    // Keep process alive
    await new Promise(() => {});
  } else {
    await displayPrice();
  }
}

// ============================================================================
// MAIN CLI
// ============================================================================

const program = new Command();

program
  .name('scale-amm')
  .description('Scale AMM CLI - Launch and trade tokens on Solana')
  .version('1.0.0');

program
  .command('launch')
  .description('Launch a new token with bonding curve pool')
  .action(launchToken);

program
  .command('buy')
  .description('Buy tokens from a pool')
  .action(buyTokens);

program
  .command('info')
  .description('Get detailed pool information')
  .action(poolInfo);

program
  .command('price')
  .description('Check current token price')
  .action(checkPrice);

// Execute CLI
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
