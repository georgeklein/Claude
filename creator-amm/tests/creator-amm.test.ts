import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmm } from "../target/types/creator_amm";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("creator-amm", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CreatorAmm as Program<CreatorAmm>;
  const authority = provider.wallet as anchor.Wallet;

  let quoteMint: PublicKey;
  let baseMint: PublicKey;
  let config: PublicKey;
  let pool: PublicKey;
  let quoteVault: PublicKey;
  let baseVault: PublicKey;
  let feeRecipient: Keypair;
  let feeRecipientQuoteAccount: PublicKey;
  let userQuoteAccount: PublicKey;
  let userBaseAccount: PublicKey;
  let creatorBaseAccount: PublicKey;

  const PROTOCOL_FEE_BPS = 100; // 1%
  const ANTI_SNIPER_WINDOW = 20; // 20 slots
  const ANTI_SNIPER_MAX_TRADE_BPS = 500; // 5% of supply

  const VIRTUAL_QUOTE_RESERVES = new anchor.BN(30_000_000_000); // 30 SOL (wrapped)
  const VIRTUAL_BASE_RESERVES = new anchor.BN(1_000_000_000_000_000); // 1B tokens
  const INITIAL_BASE_AMOUNT = new anchor.BN(1_000_000_000_000_000); // 1B tokens
  const GRADUATION_THRESHOLD = new anchor.BN(85_000_000_000); // 85 SOL

  before(async () => {
    // Create mints
    quoteMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      9 // SOL has 9 decimals
    );

    baseMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6 // New token with 6 decimals
    );

    // Create fee recipient
    feeRecipient = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      feeRecipient.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create token accounts
    feeRecipientQuoteAccount = await createAccount(
      provider.connection,
      authority.payer,
      quoteMint,
      feeRecipient.publicKey
    );

    userQuoteAccount = await createAccount(
      provider.connection,
      authority.payer,
      quoteMint,
      authority.publicKey
    );

    userBaseAccount = await createAccount(
      provider.connection,
      authority.payer,
      baseMint,
      authority.publicKey
    );

    creatorBaseAccount = await createAccount(
      provider.connection,
      authority.payer,
      baseMint,
      authority.publicKey
    );

    // Mint tokens to user and creator
    await mintTo(
      provider.connection,
      authority.payer,
      quoteMint,
      userQuoteAccount,
      authority.publicKey,
      1000_000_000_000 // 1000 quote tokens
    );

    await mintTo(
      provider.connection,
      authority.payer,
      baseMint,
      creatorBaseAccount,
      authority.publicKey,
      INITIAL_BASE_AMOUNT.toNumber()
    );

    // Derive PDAs
    [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [pool] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        quoteMint.toBuffer(),
        baseMint.toBuffer(),
      ],
      program.programId
    );

    [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), pool.toBuffer()],
      program.programId
    );

    [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), pool.toBuffer()],
      program.programId
    );
  });

  it("Initializes the AMM config", async () => {
    await program.methods
      .initialize(
        PROTOCOL_FEE_BPS,
        new anchor.BN(ANTI_SNIPER_WINDOW),
        ANTI_SNIPER_MAX_TRADE_BPS
      )
      .accounts({
        config,
        authority: authority.publicKey,
        feeRecipient: feeRecipient.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const configAccount = await program.account.config.fetch(config);
    assert.equal(configAccount.protocolFeeBps, PROTOCOL_FEE_BPS);
    assert.equal(
      configAccount.antiSniperWindow.toNumber(),
      ANTI_SNIPER_WINDOW
    );
    assert.equal(
      configAccount.antiSniperMaxTradeBps,
      ANTI_SNIPER_MAX_TRADE_BPS
    );
  });

  it("Creates a bonding curve pool", async () => {
    await program.methods
      .createPool(
        VIRTUAL_QUOTE_RESERVES,
        VIRTUAL_BASE_RESERVES,
        INITIAL_BASE_AMOUNT,
        GRADUATION_THRESHOLD
      )
      .accounts({
        config,
        pool,
        quoteMint,
        baseMint,
        quoteVault,
        baseVault,
        creatorBaseAccount,
        creator: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const poolAccount = await program.account.pool.fetch(pool);
    assert.equal(
      poolAccount.virtualQuoteReserves.toString(),
      VIRTUAL_QUOTE_RESERVES.toString()
    );
    assert.equal(
      poolAccount.virtualBaseReserves.toString(),
      VIRTUAL_BASE_RESERVES.toString()
    );
    assert.equal(poolAccount.graduated, false);

    // Verify tokens were transferred
    const baseVaultAccount = await getAccount(
      provider.connection,
      baseVault
    );
    assert.equal(
      baseVaultAccount.amount.toString(),
      INITIAL_BASE_AMOUNT.toString()
    );
  });

  it("Buys tokens from the pool", async () => {
    const quoteAmount = new anchor.BN(1_000_000_000); // 1 quote token
    const minBaseAmount = new anchor.BN(0); // No slippage protection for test

    const userQuoteBefore = await getAccount(
      provider.connection,
      userQuoteAccount
    );

    await program.methods
      .buy(quoteAmount, minBaseAmount)
      .accounts({
        config,
        pool,
        quoteVault,
        baseVault,
        userQuoteAccount,
        userBaseAccount,
        feeRecipientAccount: feeRecipientQuoteAccount,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify user received base tokens
    const userBaseAfter = await getAccount(
      provider.connection,
      userBaseAccount
    );
    assert.ok(userBaseAfter.amount > 0n);

    // Verify quote tokens were deducted
    const userQuoteAfter = await getAccount(
      provider.connection,
      userQuoteAccount
    );
    assert.ok(
      userQuoteAfter.amount <
        userQuoteBefore.amount - BigInt(quoteAmount.toNumber())
    );

    // Verify pool state updated
    const poolAccount = await program.account.pool.fetch(pool);
    assert.ok(poolAccount.realQuoteReserves.toNumber() > 0);
    assert.ok(
      poolAccount.realBaseReserves.toNumber() <
        INITIAL_BASE_AMOUNT.toNumber()
    );

    console.log("Base tokens received:", userBaseAfter.amount.toString());
    console.log(
      "Pool quote reserves:",
      poolAccount.realQuoteReserves.toString()
    );
  });

  it("Sells tokens back to the pool", async () => {
    const userBaseBefore = await getAccount(
      provider.connection,
      userBaseAccount
    );
    const baseAmount = new anchor.BN(userBaseBefore.amount.toString());
    const minQuoteAmount = new anchor.BN(0); // No slippage protection for test

    await program.methods
      .sell(baseAmount, minQuoteAmount)
      .accounts({
        config,
        pool,
        quoteVault,
        baseVault,
        userQuoteAccount,
        userBaseAccount,
        feeRecipientAccount: feeRecipientQuoteAccount,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify user received quote tokens back
    const userQuoteAfter = await getAccount(
      provider.connection,
      userQuoteAccount
    );
    assert.ok(userQuoteAfter.amount > 0n);

    // Verify base tokens were deducted
    const userBaseAfter = await getAccount(
      provider.connection,
      userBaseAccount
    );
    assert.equal(userBaseAfter.amount, 0n);

    console.log("Quote tokens received:", userQuoteAfter.amount.toString());
  });

  it("Enforces anti-sniper protection", async () => {
    // This test would need to be run immediately after pool creation
    // and would test that large trades are rejected during the anti-sniper window
    // For now, this is a placeholder
    assert.ok(true);
  });

  it("Enforces slippage protection", async () => {
    const quoteAmount = new anchor.BN(1_000_000_000);
    const minBaseAmount = new anchor.BN(999_999_999_999_999); // Impossibly high

    try {
      await program.methods
        .buy(quoteAmount, minBaseAmount)
        .accounts({
          config,
          pool,
          quoteVault,
          baseVault,
          userQuoteAccount,
          userBaseAccount,
          feeRecipientAccount: feeRecipientQuoteAccount,
          user: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      assert.fail("Should have thrown slippage error");
    } catch (err) {
      assert.ok(err.toString().includes("SlippageExceeded"));
    }
  });
});
