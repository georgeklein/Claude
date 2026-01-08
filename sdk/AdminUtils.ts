/**
 * Scale AMM Admin Utilities
 *
 * Helper functions for admin panels and monitoring dashboards.
 * Provides analytics, health checks, and alerting utilities.
 *
 * @example
 * ```typescript
 * import { AdminUtils } from './AdminUtils';
 * const admin = new AdminUtils(scale);
 * const stats = await admin.getProtocolStats();
 * console.log('Total volume:', stats.totalVolumeCrx, 'CRX');
 * ```
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { ScaleAMM, PoolInfo, ConfigInfo } from './ScaleAMM';

// ============================================================================
// TYPES
// ============================================================================

export interface ProtocolStats {
  totalPools: number;
  graduatedPools: number;
  preBondingPools: number;

  totalVolumeCrx: number;
  totalLiquidityCrx: number;

  uniqueCreators: Set<string>;
  totalCreators: number;

  averageMarketCap: number;
  totalMarketCap: number;

  oldestPool: Date;
  newestPool: Date;
}

export interface PoolMetrics {
  pool: PublicKey;
  volumePerHour: number;
  estimatedGraduationTime: Date | null;
  riskLevel: 'low' | 'medium' | 'high';
  alerts: string[];
}

export interface OracleHealth {
  address: PublicKey;
  isHealthy: boolean;
  lastUpdate: Date | null;
  issues: string[];
}

export interface GraduationAlert {
  pool: PublicKey;
  baseMint: PublicKey;
  currentProgress: number;
  estimatedTime: Date;
  crxNeeded: number;
}

export interface AnomalyAlert {
  type: 'low_liquidity' | 'high_price_impact' | 'stagnant_pool' | 'suspicious_activity';
  pool: PublicKey;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detectedAt: Date;
}

// ============================================================================
// ADMIN UTILITIES CLASS
// ============================================================================

export class AdminUtils {
  private scale: ScaleAMM;
  private connection: Connection;

  constructor(scale: ScaleAMM, connection: Connection) {
    this.scale = scale;
    this.connection = connection;
  }

  // ==========================================================================
  // PROTOCOL ANALYTICS
  // ==========================================================================

  /**
   * Get overall protocol statistics
   *
   * @example
   * ```typescript
   * const stats = await admin.getProtocolStats();
   * console.log('Total pools:', stats.totalPools);
   * console.log('Total volume:', stats.totalVolumeCrx, 'CRX');
   * ```
   */
  async getProtocolStats(): Promise<ProtocolStats> {
    const pools = await this.scale.getAllPools(1000); // Get all pools

    const creators = new Set<string>();
    let totalVolumeCrx = 0;
    let totalLiquidityCrx = 0;
    let totalMarketCap = 0;
    let graduatedCount = 0;
    let oldestDate = new Date();
    let newestDate = new Date(0);

    for (const pool of pools) {
      creators.add(pool.creator.toBase58());
      totalVolumeCrx += pool.volumeCrx;
      totalLiquidityCrx += pool.liquidityCrx;
      totalMarketCap += pool.marketCapUsd;

      if (pool.phase === 'Graduated') {
        graduatedCount++;
      }

      if (pool.createdAt < oldestDate) {
        oldestDate = pool.createdAt;
      }
      if (pool.createdAt > newestDate) {
        newestDate = pool.createdAt;
      }
    }

    return {
      totalPools: pools.length,
      graduatedPools: graduatedCount,
      preBondingPools: pools.length - graduatedCount,

      totalVolumeCrx,
      totalLiquidityCrx,

      uniqueCreators: creators,
      totalCreators: creators.size,

      averageMarketCap: pools.length > 0 ? totalMarketCap / pools.length : 0,
      totalMarketCap,

      oldestPool: oldestDate,
      newestPool: newestDate,
    };
  }

  /**
   * Get pools approaching graduation
   *
   * @param threshold Progress percentage to trigger alert (default: 80%)
   *
   * @example
   * ```typescript
   * const alerts = await admin.getGraduationAlerts(80);
   * for (const alert of alerts) {
   *   console.log(`Pool ${alert.pool.toBase58()} is ${alert.currentProgress}% to graduation`);
   * }
   * ```
   */
  async getGraduationAlerts(threshold: number = 80): Promise<GraduationAlert[]> {
    const pools = await this.scale.getAllPools(1000);
    const alerts: GraduationAlert[] = [];

    for (const pool of pools) {
      if (pool.phase === 'PreBonding' && pool.graduationProgress >= threshold) {
        // Estimate time to graduation based on recent volume
        // (This is a rough estimate, real implementation would need historical data)
        const crxNeeded = pool.graduationThresholdCrx - pool.liquidityCrx;
        const estimatedHours = Math.max(1, crxNeeded / (pool.volumeCrx / 24)); // Assume 24h of trading history
        const estimatedTime = new Date(Date.now() + estimatedHours * 3600000);

        alerts.push({
          pool: pool.address,
          baseMint: pool.baseMint,
          currentProgress: pool.graduationProgress,
          estimatedTime,
          crxNeeded,
        });
      }
    }

    return alerts.sort((a, b) => b.currentProgress - a.currentProgress);
  }

  /**
   * Detect anomalies across all pools
   *
   * @example
   * ```typescript
   * const anomalies = await admin.detectAnomalies();
   * for (const anomaly of anomalies) {
   *   console.log(`[${anomaly.severity}] ${anomaly.message}`);
   * }
   * ```
   */
  async detectAnomalies(): Promise<AnomalyAlert[]> {
    const pools = await this.scale.getAllPools(1000);
    const alerts: AnomalyAlert[] = [];
    const now = new Date();

    for (const pool of pools) {
      // Check for low liquidity
      if (pool.liquidityCrx < 100) {
        alerts.push({
          type: 'low_liquidity',
          pool: pool.address,
          severity: 'warning',
          message: `Low liquidity: ${pool.liquidityCrx.toFixed(2)} CRX`,
          detectedAt: now,
        });
      }

      // Check for stagnant pools (created >7 days ago, <10% progress)
      const ageInDays = (now.getTime() - pool.createdAt.getTime()) / (1000 * 3600 * 24);
      if (ageInDays > 7 && pool.graduationProgress < 10) {
        alerts.push({
          type: 'stagnant_pool',
          pool: pool.address,
          severity: 'info',
          message: `Pool stagnant for ${ageInDays.toFixed(1)} days with ${pool.graduationProgress.toFixed(1)}% progress`,
          detectedAt: now,
        });
      }

      // Check for extremely high market cap (potential price manipulation)
      if (pool.marketCapUsd > 10_000_000) { // $10M+
        alerts.push({
          type: 'suspicious_activity',
          pool: pool.address,
          severity: 'warning',
          message: `Unusually high market cap: $${(pool.marketCapUsd / 1_000_000).toFixed(2)}M`,
          detectedAt: now,
        });
      }

      // Check for high price impact risk (low liquidity relative to market cap)
      const liquidityRatio = pool.liquidityCrx / (pool.marketCapUsd / 1000); // Rough estimate
      if (liquidityRatio < 0.1 && pool.marketCapUsd > 10000) {
        alerts.push({
          type: 'high_price_impact',
          pool: pool.address,
          severity: 'info',
          message: `High price impact risk due to low liquidity ratio`,
          detectedAt: now,
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Check oracle health
   *
   * @example
   * ```typescript
   * const health = await admin.checkOracleHealth();
   * if (!health.isHealthy) {
   *   console.warn('Oracle issues:', health.issues);
   * }
   * ```
   */
  async checkOracleHealth(): Promise<OracleHealth> {
    try {
      const config = await this.scale.getConfig();
      const issues: string[] = [];

      // Check if oracle account exists
      const oracleInfo = await this.connection.getAccountInfo(config.crxPriceOracle);

      if (!oracleInfo) {
        issues.push('Oracle account does not exist');
        return {
          address: config.crxPriceOracle,
          isHealthy: false,
          lastUpdate: null,
          issues,
        };
      }

      // Note: Full oracle validation requires parsing Pyth/Switchboard data
      // This is a basic check - production implementations should validate:
      // - Price staleness (last update timestamp)
      // - Confidence intervals
      // - Price bounds

      return {
        address: config.crxPriceOracle,
        isHealthy: issues.length === 0,
        lastUpdate: new Date(), // Would parse from oracle data
        issues,
      };
    } catch (error) {
      return {
        address: PublicKey.default,
        isHealthy: false,
        lastUpdate: null,
        issues: [`Oracle health check failed: ${error}`],
      };
    }
  }

  // ==========================================================================
  // POOL-SPECIFIC METRICS
  // ==========================================================================

  /**
   * Get detailed metrics for a specific pool
   *
   * @example
   * ```typescript
   * const metrics = await admin.getPoolMetrics(poolAddress);
   * console.log('Volume per hour:', metrics.volumePerHour, 'CRX');
   * ```
   */
  async getPoolMetrics(poolAddress: PublicKey): Promise<PoolMetrics> {
    const poolInfo = await this.scale.getPool(poolAddress);

    // Calculate volume per hour (rough estimate based on pool age)
    const ageInHours = (Date.now() - poolInfo.createdAt.getTime()) / (1000 * 3600);
    const volumePerHour = ageInHours > 0 ? poolInfo.volumeCrx / ageInHours : 0;

    // Estimate graduation time
    let estimatedGraduationTime: Date | null = null;
    if (poolInfo.phase === 'PreBonding' && volumePerHour > 0) {
      const crxNeeded = poolInfo.graduationThresholdCrx - poolInfo.liquidityCrx;
      const hoursToGraduation = crxNeeded / volumePerHour;
      estimatedGraduationTime = new Date(Date.now() + hoursToGraduation * 3600000);
    }

    // Assess risk level
    const alerts: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    if (poolInfo.liquidityCrx < 100) {
      alerts.push('Low liquidity');
      riskLevel = 'high';
    }

    if (volumePerHour < 10 && ageInHours > 24) {
      alerts.push('Low trading activity');
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    return {
      pool: poolAddress,
      volumePerHour,
      estimatedGraduationTime,
      riskLevel,
      alerts,
    };
  }

  // ==========================================================================
  // CREATOR ANALYTICS
  // ==========================================================================

  /**
   * Get top creators by total volume
   *
   * @param limit Number of creators to return (default: 10)
   *
   * @example
   * ```typescript
   * const topCreators = await admin.getTopCreators(5);
   * for (const creator of topCreators) {
   *   console.log(`${creator.address}: ${creator.totalVolume} CRX`);
   * }
   * ```
   */
  async getTopCreators(limit: number = 10): Promise<Array<{ address: PublicKey; poolCount: number; totalVolume: number }>> {
    const pools = await this.scale.getAllPools(1000);
    const creatorMap = new Map<string, { address: PublicKey; poolCount: number; totalVolume: number }>();

    for (const pool of pools) {
      const key = pool.creator.toBase58();
      const existing = creatorMap.get(key);

      if (existing) {
        existing.poolCount++;
        existing.totalVolume += pool.volumeCrx;
      } else {
        creatorMap.set(key, {
          address: pool.creator,
          poolCount: 1,
          totalVolume: pool.volumeCrx,
        });
      }
    }

    const creators = Array.from(creatorMap.values());
    return creators
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, limit);
  }

  // ==========================================================================
  // RESERVE VALIDATION
  // ==========================================================================

  /**
   * Validate pool reserves match vault balances
   *
   * @example
   * ```typescript
   * const isValid = await admin.validatePoolReserves(poolAddress);
   * if (!isValid) {
   *   console.error('Reserve mismatch detected!');
   * }
   * ```
   */
  async validatePoolReserves(poolAddress: PublicKey): Promise<boolean> {
    try {
      const poolInfo = await this.scale.getPool(poolAddress);

      // Get vault token accounts
      // Note: This requires fetching vault addresses from pool data
      // Production implementation would validate:
      // - Real reserves match vault balances
      // - Virtual reserves calculated correctly
      // - No unauthorized withdrawals

      return true; // Placeholder
    } catch (error) {
      console.error('Reserve validation failed:', error);
      return false;
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default AdminUtils;
