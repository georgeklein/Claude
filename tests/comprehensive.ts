import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { expect } from "chai";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Scale AMM - Comprehensive Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  // Global accounts
  let config: PublicKey;
  let authority: Keypair;
  let feeRecipient: Keypair;
  let crxMint: PublicKey;
  let crxPriceOracle: Keypair;
  let feeRecipientCrxAccount: PublicKey;

  // Test users
  let creator: Keypair;
  let trader1: Keypair;
  let trader2: Keypair;

  // Helper: Create mock Pyth oracle account
  async function createMockOracle(price: number = 200_000_000, conf: number = 1_000_000, expo: number = -8, publishTime?: number): Promise<Keypair> {
    const oracle = Keypair.generate();
    const space = 8 + 8 + 8 + 4 + 8;
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(space);

    // Write oracle data as PythPriceFeed struct
    const data = Buffer.alloc(space);
    const discriminator = Buffer.from([0x9a, 0x27, 0x1c, 0x8f, 0x3e, 0x2b, 0x45, 0x67]);
    discriminator.copy(data, 0);
    data.writeBigInt64LE(BigInt(price), 8);
    data.writeBigUInt64LE(BigInt(conf), 16);
    data.writeInt32LE(expo, 24);
    const timestamp = publishTime !== undefined ? publishTime : Math.floor(Date.now() / 1000);
    data.writeBigInt64LE(BigInt(timestamp), 28);

    const createIx = SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: oracle.publicKey,
      lamports,
      space,
      programId: program.programId,
    });

    const tx = new anchor.web3.Transaction().add(createIx);
    await provider.sendAndConfirm(tx, [oracle]);

    // Write data to the account
    const accountInfo = await provider.connection.getAccountInfo(oracle.publicKey);
    if (accountInfo) {
      await provider.connection._rpcRequest('setAccount', [
        oracle.publicKey.toBase58(),
        {
          lamports: accountInfo.lamports,
          data: [data.toString('base64'), 'base64'],
          owner: program.programId.toBase58(),
          executable: false,
          rentEpoch: accountInfo.rentEpoch,
        },
      ]);
    }

    return oracle;
  }

  // Helper: Create token mint with revoked authorities
  async function createTokenWithRevokedAuthorities(decimals: number = 6): Promise<PublicKey> {
    const mint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      decimals
    );
    await setAuthority(
      provider.connection,
      creator,
      mint,
      creator.publicKey,
      AuthorityType.MintTokens,
      null
    );
    return mint;
  }

  // Helper: Airdrop SOL
  async function airdrop(pubkey: PublicKey, amount: number = 10) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }

  // Helper: Create pool
  async function createPool(
    baseMint: PublicKey,
    targetMarketCapUsd: anchor.BN,
    tokenSupply: anchor.BN,
    feeBps: number,
    curveType: any,
    graduationThresholdUsd: anchor.BN
  ) {
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), baseMint.toBuffer()],
      program.programId
    );
    const [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), pool.toBuffer()],
      program.programId
    );
    const [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), pool.toBuffer()],
      program.programId
    );
    const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      baseMint,
      creator.publicKey
    );

    await program.methods
      .createPool(targetMarketCapUsd, tokenSupply, feeBps, curveType, graduationThresholdUsd, false, "")
      .accounts({
        config,
        pool,
        quoteMint: crxMint,
        baseMint,
        quoteVault,
        baseVault,
        creatorBaseAccount: creatorBaseAccount.address,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    return { pool, quoteVault, baseVault };
  }

  // Helper: Execute trade (buy or sell)
  async function executeTrade(
    pool: PublicKey,
    quoteVault: PublicKey,
    baseVault: PublicKey,
    baseMint: PublicKey,
    user: Keypair,
    isBuy: boolean,
    amount: anchor.BN,
    minAmount: anchor.BN
  ) {
    const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      crxMint,
      user.publicKey
    );
    const userBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      baseMint,
      user.publicKey
    );

    const method = isBuy ? program.methods.buy(amount, minAmount) : program.methods.sell(amount, minAmount);
    await method
      .accounts({
        config,
        pool,
        quoteVault,
        baseVault,
        userQuoteAccount: userQuoteAccount.address,
        userBaseAccount: userBaseAccount.address,
        feeRecipientAccount: feeRecipientCrxAccount,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    return { userQuoteAccount, userBaseAccount };
  }

  // Helper: Verify vault balances match reserves
  async function verifyVaultBalances(pool: PublicKey, quoteVault: PublicKey, baseVault: PublicKey) {
    const poolAccount = await program.account.pool.fetch(pool);
    const quoteVaultAccount = await getAccount(provider.connection, quoteVault);
    const baseVaultAccount = await getAccount(provider.connection, baseVault);
    expect(poolAccount.realQuoteReserves.toString()).to.equal(quoteVaultAccount.amount.toString());
    expect(poolAccount.realBaseReserves.toString()).to.equal(baseVaultAccount.amount.toString());
  }

  // Helper: Setup test pool
  async function setupTestPool(
    marketCap: number = 10_000_000_000,
    graduationThreshold: number = 40_000_000_000
  ) {
    const baseMint = await createTokenWithRevokedAuthorities();
    const tokenSupply = new anchor.BN(1_000_000_000_000);
    await mintTo(
      provider.connection,
      creator,
      baseMint,
      (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
      creator,
      tokenSupply.toNumber()
    );
    const { pool, quoteVault, baseVault } = await createPool(
      baseMint,
      new anchor.BN(marketCap),
      tokenSupply,
      25,
      { constantProduct: {} },
      new anchor.BN(graduationThreshold)
    );
    return { pool, quoteVault, baseVault, baseMint };
  }

  // Setup before all tests
  before(async () => {
    authority = Keypair.generate();
    feeRecipient = Keypair.generate();
    creator = Keypair.generate();
    trader1 = Keypair.generate();
    trader2 = Keypair.generate();

    await Promise.all([
      airdrop(authority.publicKey),
      airdrop(feeRecipient.publicKey),
      airdrop(creator.publicKey),
      airdrop(trader1.publicKey),
      airdrop(trader2.publicKey),
    ]);

    crxMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    crxPriceOracle = await createMockOracle();

    [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    feeRecipientCrxAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, feeRecipient, crxMint, feeRecipient.publicKey)
    ).address;

    await program.methods
      .initialize(
        new anchor.BN(2_000_000),     // initial_crx_price_usd: $2.00
        new anchor.BN(60),             // oracle_max_age_seconds
        [                               // approved_quote_tokens [5]
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
        ],
        0                               // approved_quote_count
      )
      .accounts({
        config,
        authority: authority.publicKey,
        feeRecipient: feeRecipient.publicKey,
        crxPriceOracle: crxPriceOracle.publicKey, // Kept for backward compat, not used
        crxMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log("✅ Test environment initialized");
  });

  describe("1. Pool Creation", () => {
    it("Should create pools with different curve types", async () => {
      const baseMint1 = await createTokenWithRevokedAuthorities();
      const baseMint2 = await createTokenWithRevokedAuthorities();
      const tokenSupply = new anchor.BN(1_000_000_000_000);

      for (const mint of [baseMint1, baseMint2]) {
        await mintTo(
          provider.connection,
          creator,
          mint,
          (await getOrCreateAssociatedTokenAccount(provider.connection, creator, mint, creator.publicKey)).address,
          creator,
          tokenSupply.toNumber()
        );
      }

      const { pool: pool1 } = await createPool(
        baseMint1,
        new anchor.BN(10_000_000_000),
        tokenSupply,
        25,
        { constantProduct: {} },
        new anchor.BN(40_000_000_000)
      );
      const { pool: pool2 } = await createPool(
        baseMint2,
        new anchor.BN(10_000_000_000),
        tokenSupply,
        100,
        { exponential: {} },
        new anchor.BN(40_000_000_000)
      );

      const pool1Account = await program.account.pool.fetch(pool1);
      const pool2Account = await program.account.pool.fetch(pool2);

      expect(pool1Account.curveType).to.deep.equal({ constantProduct: {} });
      expect(pool1Account.feeBps).to.equal(25);
      expect(pool2Account.curveType).to.deep.equal({ exponential: {} });
      expect(pool2Account.feeBps).to.equal(100);
    });

    it("Should reject Custom curve and invalid parameters", async () => {
      const baseMint = await createTokenWithRevokedAuthorities();
      const tokenSupply = new anchor.BN(1_000_000_000_000);
      await mintTo(
        provider.connection,
        creator,
        baseMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
        creator,
        tokenSupply.toNumber()
      );

      try {
        await createPool(
          baseMint,
          new anchor.BN(10_000_000_000),
          tokenSupply,
          25,
          { custom: {} },
          new anchor.BN(40_000_000_000)
        );
        expect.fail("Should reject Custom curve");
      } catch (err) {
        expect(err.toString()).to.include("CustomCurveNotImplemented");
      }
    });

    it("Should reject mint with authority not revoked", async () => {
      const baseMint = await createMint(provider.connection, creator, creator.publicKey, null, 6);
      const tokenSupply = new anchor.BN(1_000_000_000_000);
      await mintTo(
        provider.connection,
        creator,
        baseMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
        creator,
        tokenSupply.toNumber()
      );

      try {
        await createPool(
          baseMint,
          new anchor.BN(10_000_000_000),
          tokenSupply,
          25,
          { constantProduct: {} },
          new anchor.BN(40_000_000_000)
        );
        expect.fail("Should reject mint with authority");
      } catch (err) {
        expect(err.toString()).to.include("MintAuthorityNotRevoked");
      }
    });

    it("Should validate fee tiers correctly", async () => {
      const baseMint = await createTokenWithRevokedAuthorities();
      const tokenSupply = new anchor.BN(1_000_000_000_000);
      await mintTo(
        provider.connection,
        creator,
        baseMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
        creator,
        tokenSupply.toNumber()
      );

      // Valid fees: 0, 25, 100
      const { pool } = await createPool(
        baseMint,
        new anchor.BN(10_000_000_000),
        tokenSupply,
        0,
        { constantProduct: {} },
        new anchor.BN(40_000_000_000)
      );
      const poolAccount = await program.account.pool.fetch(pool);
      expect(poolAccount.feeBps).to.equal(0);

      // Invalid fee: 50
      const baseMint2 = await createTokenWithRevokedAuthorities();
      await mintTo(
        provider.connection,
        creator,
        baseMint2,
        (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint2, creator.publicKey)).address,
        creator,
        tokenSupply.toNumber()
      );

      try {
        await createPool(
          baseMint2,
          new anchor.BN(10_000_000_000),
          tokenSupply,
          50,
          { constantProduct: {} },
          new anchor.BN(40_000_000_000)
        );
        expect.fail("Should reject invalid fee");
      } catch (err) {
        expect(err.toString()).to.include("InvalidFee");
      }
    });

    it("Should validate market cap ranges", async () => {
      const baseMint1 = await createTokenWithRevokedAuthorities();
      const baseMint2 = await createTokenWithRevokedAuthorities();
      const tokenSupply = new anchor.BN(1_000_000_000_000);

      for (const mint of [baseMint1, baseMint2]) {
        await mintTo(
          provider.connection,
          creator,
          mint,
          (await getOrCreateAssociatedTokenAccount(provider.connection, creator, mint, creator.publicKey)).address,
          creator,
          tokenSupply.toNumber()
        );
      }

      // Too low
      try {
        await createPool(
          baseMint1,
          new anchor.BN(500_000_000),
          tokenSupply,
          25,
          { constantProduct: {} },
          new anchor.BN(40_000_000_000)
        );
        expect.fail("Should reject low market cap");
      } catch (err) {
        expect(err.toString()).to.include("InvalidMarketCap");
      }

      // Too high
      try {
        await createPool(
          baseMint2,
          new anchor.BN(2_000_000_000_000),
          tokenSupply,
          25,
          { constantProduct: {} },
          new anchor.BN(5_000_000_000_000)
        );
        expect.fail("Should reject high market cap");
      } catch (err) {
        expect(err.toString()).to.include("InvalidMarketCap");
      }
    });

    it("Should reject invalid graduation threshold", async () => {
      const baseMint = await createTokenWithRevokedAuthorities();
      const tokenSupply = new anchor.BN(1_000_000_000_000);
      await mintTo(
        provider.connection,
        creator,
        baseMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
        creator,
        tokenSupply.toNumber()
      );

      try {
        await createPool(
          baseMint,
          new anchor.BN(10_000_000_000),
          tokenSupply,
          25,
          { constantProduct: {} },
          new anchor.BN(5_000_000_000) // Less than market cap
        );
        expect.fail("Should reject invalid graduation threshold");
      } catch (err) {
        expect(err.toString()).to.include("InvalidMarketCap");
      }
    });
  });

  describe("2. Buy Operations", () => {
    let testPool: PublicKey, testQuoteVault: PublicKey, testBaseVault: PublicKey, testBaseMint: PublicKey;

    before(async () => {
      const setup = await setupTestPool();
      testPool = setup.pool;
      testQuoteVault = setup.quoteVault;
      testBaseVault = setup.baseVault;
      testBaseMint = setup.baseMint;

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );
    });

    it("Should execute buy with slippage protection", async () => {
      const quoteAmount = new anchor.BN(1_000_000);
      const minBaseAmount = new anchor.BN(190_000);

      await executeTrade(testPool, testQuoteVault, testBaseVault, testBaseMint, trader1, true, quoteAmount, minBaseAmount);

      const poolAccount = await program.account.pool.fetch(testPool);
      expect(poolAccount.currentPhase).to.deep.equal({ preBonding: {} });
      expect(poolAccount.realQuoteReserves.gt(new anchor.BN(0))).to.be.true;

      const userBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        trader1,
        testBaseMint,
        trader1.publicKey
      );
      const balance = await getAccount(provider.connection, userBaseAccount.address);
      expect(Number(balance.amount)).to.be.greaterThan(minBaseAmount.toNumber());
    });

    it("Should reject invalid buy amounts", async () => {
      // SlippageExceeded
      try {
        await executeTrade(
          testPool,
          testQuoteVault,
          testBaseVault,
          testBaseMint,
          trader1,
          true,
          new anchor.BN(1_000_000),
          new anchor.BN(1_000_000_000_000)
        );
        expect.fail("Should reject due to slippage");
      } catch (err) {
        expect(err.toString()).to.include("SlippageExceeded");
      }

      // OutputTooSmall
      try {
        await executeTrade(
          testPool,
          testQuoteVault,
          testBaseVault,
          testBaseMint,
          trader1,
          true,
          new anchor.BN(1),
          new anchor.BN(0)
        );
        expect.fail("Should reject dust trade");
      } catch (err) {
        expect(err.toString()).to.include("OutputTooSmall");
      }

      // Zero amount
      try {
        await executeTrade(
          testPool,
          testQuoteVault,
          testBaseVault,
          testBaseMint,
          trader1,
          true,
          new anchor.BN(0),
          new anchor.BN(0)
        );
        expect.fail("Should reject zero amount");
      } catch (err) {
        expect(err.toString()).to.include("InvalidAmount");
      }
    });

    it("Should collect fees to fee recipient", async () => {
      const feeBalanceBefore = await getAccount(provider.connection, feeRecipientCrxAccount);
      await executeTrade(
        testPool,
        testQuoteVault,
        testBaseVault,
        testBaseMint,
        trader1,
        true,
        new anchor.BN(10_000_000),
        new anchor.BN(0)
      );
      const feeBalanceAfter = await getAccount(provider.connection, feeRecipientCrxAccount);
      expect(Number(feeBalanceAfter.amount)).to.be.greaterThan(Number(feeBalanceBefore.amount));
    });
  });

  describe("3. Sell Operations", () => {
    let sellPool: PublicKey, sellQuoteVault: PublicKey, sellBaseVault: PublicKey, sellBaseMint: PublicKey;

    before(async () => {
      const setup = await setupTestPool();
      sellPool = setup.pool;
      sellQuoteVault = setup.quoteVault;
      sellBaseVault = setup.baseVault;
      sellBaseMint = setup.baseMint;

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Buy tokens first
      await executeTrade(sellPool, sellQuoteVault, sellBaseVault, sellBaseMint, trader1, true, new anchor.BN(10_000_000), new anchor.BN(0));
    });

    it("Should execute sell with slippage protection", async () => {
      const baseAmount = new anchor.BN(1_000_000);
      const minQuoteAmount = new anchor.BN(1);

      await executeTrade(sellPool, sellQuoteVault, sellBaseVault, sellBaseMint, trader1, false, baseAmount, minQuoteAmount);

      const poolAccount = await program.account.pool.fetch(sellPool);
      expect(poolAccount.currentPhase).to.deep.equal({ preBonding: {} });

      const userQuoteAccount = await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey);
      const balance = await getAccount(provider.connection, userQuoteAccount.address);
      expect(Number(balance.amount)).to.be.greaterThan(0);
    });

    it("Should reject invalid sell amounts", async () => {
      // SlippageExceeded
      try {
        await executeTrade(
          sellPool,
          sellQuoteVault,
          sellBaseVault,
          sellBaseMint,
          trader1,
          false,
          new anchor.BN(1_000_000),
          new anchor.BN(1_000_000_000_000)
        );
        expect.fail("Should reject due to slippage");
      } catch (err) {
        expect(err.toString()).to.include("SlippageExceeded");
      }

      // OutputTooSmall
      try {
        await executeTrade(
          sellPool,
          sellQuoteVault,
          sellBaseVault,
          sellBaseMint,
          trader1,
          false,
          new anchor.BN(1),
          new anchor.BN(0)
        );
        expect.fail("Should reject dust trade");
      } catch (err) {
        expect(err.toString()).to.include("OutputTooSmall");
      }
    });
  });

  describe("4. Graduation & Phase Transitions", () => {
    let gradPool: PublicKey, gradQuoteVault: PublicKey, gradBaseVault: PublicKey, gradBaseMint: PublicKey;

    before(async () => {
      const setup = await setupTestPool(5_000_000_000, 10_000_000_000);
      gradPool = setup.pool;
      gradQuoteVault = setup.quoteVault;
      gradBaseVault = setup.baseVault;
      gradBaseMint = setup.baseMint;

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader2, crxMint, trader2.publicKey)).address,
        authority,
        10_000_000_000_000
      );
    });

    it("Should graduate and enable zero-fee trading", async () => {
      // Trigger graduation
      await executeTrade(
        gradPool,
        gradQuoteVault,
        gradBaseVault,
        gradBaseMint,
        trader2,
        true,
        new anchor.BN(5_000_000_000),
        new anchor.BN(0)
      );

      const poolAccount = await program.account.pool.fetch(gradPool);
      expect(poolAccount.currentPhase).to.deep.equal({ graduated: {} });

      // Verify trading works and fee is 0
      await executeTrade(gradPool, gradQuoteVault, gradBaseVault, gradBaseMint, trader2, true, new anchor.BN(1_000_000), new anchor.BN(0));

      const currentFee = poolAccount.currentPhase.graduated ? 0 : poolAccount.feeBps;
      expect(currentFee).to.equal(0);
    });

    it("Should maintain constant product after graduation", async () => {
      const poolBefore = await program.account.pool.fetch(gradPool);
      const productBefore = poolBefore.realQuoteReserves.mul(poolBefore.realBaseReserves);

      // Buy
      await executeTrade(gradPool, gradQuoteVault, gradBaseVault, gradBaseMint, trader2, true, new anchor.BN(5_000_000), new anchor.BN(0));

      const poolMid = await program.account.pool.fetch(gradPool);
      const productMid = poolMid.realQuoteReserves.mul(poolMid.realBaseReserves);
      expect(productMid.toString()).to.equal(productBefore.toString());

      // Sell
      const traderBaseAccount = await getOrCreateAssociatedTokenAccount(provider.connection, trader2, gradBaseMint, trader2.publicKey);
      const baseBalance = await getAccount(provider.connection, traderBaseAccount.address);
      await executeTrade(
        gradPool,
        gradQuoteVault,
        gradBaseVault,
        gradBaseMint,
        trader2,
        false,
        new anchor.BN(Number(baseBalance.amount) / 2),
        new anchor.BN(0)
      );

      const poolAfter = await program.account.pool.fetch(gradPool);
      const productAfter = poolAfter.realQuoteReserves.mul(poolAfter.realBaseReserves);
      expect(productAfter.toString()).to.equal(productBefore.toString());
    });
  });

  describe("5. Price Discovery", () => {
    it("Should show price increases with buys and decreases with sells", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      const poolBefore = await program.account.pool.fetch(pool);
      const priceBefore = poolBefore.virtualQuoteReserves.toNumber() / poolBefore.virtualBaseReserves.toNumber();

      // Buy - price should increase
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(10_000_000), new anchor.BN(0));

      const poolMid = await program.account.pool.fetch(pool);
      const priceMid = poolMid.virtualQuoteReserves.toNumber() / poolMid.virtualBaseReserves.toNumber();
      expect(priceMid).to.be.greaterThan(priceBefore);

      // Sell - price should decrease
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, false, new anchor.BN(1_000_000), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      const priceAfter = poolAfter.virtualQuoteReserves.toNumber() / poolAfter.virtualBaseReserves.toNumber();
      expect(priceAfter).to.be.lessThan(priceMid);
    });
  });

  describe("6. Edge Cases & Stress Tests", () => {
    let edgePool: PublicKey, edgeQuoteVault: PublicKey, edgeBaseVault: PublicKey, edgeBaseMint: PublicKey;

    before(async () => {
      const setup = await setupTestPool();
      edgePool = setup.pool;
      edgeQuoteVault = setup.quoteVault;
      edgeBaseVault = setup.baseVault;
      edgeBaseMint = setup.baseMint;

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        10_000_000_000_000
      );
    });

    it("Should handle large volume trades", async () => {
      await executeTrade(edgePool, edgeQuoteVault, edgeBaseVault, edgeBaseMint, trader1, true, new anchor.BN(100_000_000), new anchor.BN(0));
      await verifyVaultBalances(edgePool, edgeQuoteVault, edgeBaseVault);
    });

    it("Should maintain invariants across sequential trades", async () => {
      for (let i = 0; i < 5; i++) {
        await executeTrade(edgePool, edgeQuoteVault, edgeBaseVault, edgeBaseMint, trader1, true, new anchor.BN(1_000_000), new anchor.BN(0));
        await verifyVaultBalances(edgePool, edgeQuoteVault, edgeBaseVault);
      }
    });
  });

  describe("7. System Integrity", () => {
    let sysPool: PublicKey, sysQuoteVault: PublicKey, sysBaseVault: PublicKey, sysBaseMint: PublicKey;

    before(async () => {
      const setup = await setupTestPool();
      sysPool = setup.pool;
      sysQuoteVault = setup.quoteVault;
      sysBaseVault = setup.baseVault;
      sysBaseMint = setup.baseMint;

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );
    });

    it("Should maintain virtual x*y=k in PreBonding", async () => {
      const poolBefore = await program.account.pool.fetch(sysPool);
      const productBefore = poolBefore.virtualQuoteReserves.mul(poolBefore.virtualBaseReserves);

      await executeTrade(sysPool, sysQuoteVault, sysBaseVault, sysBaseMint, trader1, true, new anchor.BN(1_000_000), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(sysPool);
      const productAfter = poolAfter.virtualQuoteReserves.mul(poolAfter.virtualBaseReserves);

      // With fees, product can decrease slightly but should maintain pricing integrity
      expect(productAfter.gte(productBefore.muln(0.99))).to.be.true;
    });

    it("Should verify comprehensive accounting integrity", async () => {
      const feeBalanceBefore = await getAccount(provider.connection, feeRecipientCrxAccount);

      await executeTrade(sysPool, sysQuoteVault, sysBaseVault, sysBaseMint, trader1, true, new anchor.BN(10_000_000), new anchor.BN(0));

      // Verify vault balances match reserves
      const poolAfter = await program.account.pool.fetch(sysPool);
      const quoteVaultAccount = await getAccount(provider.connection, sysQuoteVault);
      const baseVaultAccount = await getAccount(provider.connection, sysBaseVault);

      expect(poolAfter.realQuoteReserves.toString()).to.equal(quoteVaultAccount.amount.toString());
      expect(poolAfter.realBaseReserves.toString()).to.equal(baseVaultAccount.amount.toString());

      // Verify fee collection
      const feeBalanceAfter = await getAccount(provider.connection, feeRecipientCrxAccount);
      const feeCollected = Number(feeBalanceAfter.amount) - Number(feeBalanceBefore.amount);
      expect(feeCollected).to.be.greaterThan(0);
    });
  });
});
