/**
 * Load Testing Scenarios for Creator Platform
 *
 * Using k6 (https://k6.io/) for load testing
 *
 * Run:
 * k6 run tests/load-test-scenarios.js
 *
 * Install k6:
 * brew install k6  (macOS)
 * sudo apt-get install k6  (Linux)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const poolCreationSuccess = new Rate('pool_creation_success');
const tradeSuccess = new Rate('trade_success');
const poolCreationDuration = new Trend('pool_creation_duration');
const tradeDuration = new Trend('trade_duration');
const errorCounter = new Counter('errors');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const RPC_URL = __ENV.RPC_URL || 'https://api.devnet.solana.com';

// ============================================================================
// Scenario 1: Ramp-Up Test (10 → 1000 users)
// ============================================================================
export const options_rampup = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '5m', target: 100 },   // Ramp to 100 over 5 minutes
        { duration: '5m', target: 500 },   // Ramp to 500 over 5 minutes
        { duration: '5m', target: 1000 },  // Ramp to 1000 over 5 minutes
        { duration: '10m', target: 1000 }, // Stay at 1000 for 10 minutes
        { duration: '5m', target: 0 },     // Ramp down
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<5000'],           // 95% of requests < 5s
    'pool_creation_success': ['rate>0.95'],        // 95% success rate
    'trade_success': ['rate>0.98'],                // 98% success rate
    'errors': ['count<100'],                       // < 100 total errors
  },
};

// ============================================================================
// Scenario 2: Sustained Load Test (500 users, 4 hours)
// ============================================================================
export const options_sustained = {
  scenarios: {
    sustained: {
      executor: 'constant-vus',
      vus: 500,
      duration: '4h',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<5000', 'p(99)<10000'],
    'pool_creation_success': ['rate>0.95'],
    'trade_success': ['rate>0.98'],
  },
};

// ============================================================================
// Scenario 3: Spike Test (100 → 1000 → 100 users)
// ============================================================================
export const options_spike = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '1m', target: 100 },   // Baseline: 100 users
        { duration: '10s', target: 1000 }, // SPIKE to 1000 instantly
        { duration: '5m', target: 1000 },  // Hold spike for 5 minutes
        { duration: '10s', target: 100 },  // Drop back to baseline
        { duration: '5m', target: 100 },   // Recovery period
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<10000'], // Allow higher latency during spike
    'errors': ['count<500'],              // Allow more errors during spike
  },
};

// ============================================================================
// Scenario 4: Stress Test (1000 pools/hour, 24 hours)
// ============================================================================
export const options_stress = {
  scenarios: {
    pool_creation_stress: {
      executor: 'constant-arrival-rate',
      rate: 17,              // 17 pools/minute ≈ 1000 pools/hour
      timeUnit: '1m',
      duration: '24h',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
  thresholds: {
    'pool_creation_success': ['rate>0.95'],
    'pool_creation_duration': ['p(95)<5000'],
  },
};

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Main test function
 * Simulates realistic user behavior: create pool → trade → wait → repeat
 */
export default function () {
  const scenario = Math.random();

  if (scenario < 0.1) {
    // 10% of users create pools
    createPool();
  } else if (scenario < 0.6) {
    // 50% of users trade (buy)
    executeBuy();
  } else if (scenario < 0.9) {
    // 30% of users trade (sell)
    executeSell();
  } else {
    // 10% of users just browse
    browseTerminal();
  }

  // Random think time (1-5 seconds)
  sleep(1 + Math.random() * 4);
}

/**
 * Test Case: Create Pool
 * Simulates token creation flow with fee sponsorship
 */
function createPool() {
  const startTime = Date.now();

  const payload = JSON.stringify({
    name: `TestToken${Math.floor(Math.random() * 1000000)}`,
    ticker: `TEST${Math.floor(Math.random() * 10000)}`,
    description: 'Load test token',
    imageUrl: 'https://example.com/token.png',
    supply: 1_000_000_000,
    initialMarketCapUsd: 10_000,
    graduationThresholdUsd: 40_000,
    creatorFeeBps: 100,
    curveType: 'ConstantProduct',
    disableWaa: false,
  });

  const headers = {
    'Content-Type': 'application/json',
  };

  const res = http.post(`${BASE_URL}/api/pools/create`, payload, {
    headers,
    timeout: '30s',
  });

  const success = check(res, {
    'pool creation status 200': (r) => r.status === 200,
    'pool creation has signature': (r) => JSON.parse(r.body).signature !== undefined,
    'pool creation < 5s': (r) => r.timings.duration < 5000,
  });

  poolCreationSuccess.add(success);
  poolCreationDuration.add(Date.now() - startTime);

  if (!success) {
    console.error(`Pool creation failed: ${res.status} - ${res.body}`);
    errorCounter.add(1);
  } else {
    console.log(`✓ Pool created in ${Date.now() - startTime}ms`);
  }

  return res;
}

/**
 * Test Case: Execute Buy
 * Simulates buying tokens from a random pool
 */
function executeBuy() {
  const startTime = Date.now();

  // Get random pool from available pools
  const poolsRes = http.get(`${BASE_URL}/api/pools?limit=100`);
  if (poolsRes.status !== 200) {
    errorCounter.add(1);
    return;
  }

  const pools = JSON.parse(poolsRes.body);
  if (pools.length === 0) {
    console.log('No pools available for trading');
    return;
  }

  const randomPool = pools[Math.floor(Math.random() * pools.length)];

  // Execute buy
  const buyPayload = JSON.stringify({
    poolAddress: randomPool.address,
    crxAmount: Math.random() * 100 + 10, // 10-110 CRX
    slippage: 1.0,
  });

  const res = http.post(`${BASE_URL}/api/trade/buy`, buyPayload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  const success = check(res, {
    'buy status 200': (r) => r.status === 200,
    'buy has signature': (r) => JSON.parse(r.body).signature !== undefined,
    'buy < 3s': (r) => r.timings.duration < 3000,
  });

  tradeSuccess.add(success);
  tradeDuration.add(Date.now() - startTime);

  if (!success) {
    console.error(`Buy failed: ${res.status} - ${res.body}`);
    errorCounter.add(1);
  }

  return res;
}

/**
 * Test Case: Execute Sell
 * Simulates selling tokens
 */
function executeSell() {
  const startTime = Date.now();

  // Get random pool
  const poolsRes = http.get(`${BASE_URL}/api/pools?limit=100`);
  if (poolsRes.status !== 200) {
    errorCounter.add(1);
    return;
  }

  const pools = JSON.parse(poolsRes.body);
  if (pools.length === 0) return;

  const randomPool = pools[Math.floor(Math.random() * pools.length)];

  // Execute sell
  const sellPayload = JSON.stringify({
    poolAddress: randomPool.address,
    tokenAmount: Math.random() * 10000 + 1000, // 1k-11k tokens
    slippage: 1.0,
  });

  const res = http.post(`${BASE_URL}/api/trade/sell`, sellPayload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  const success = check(res, {
    'sell status 200': (r) => r.status === 200 || r.status === 400, // 400 if insufficient balance
    'sell < 3s': (r) => r.timings.duration < 3000,
  });

  tradeSuccess.add(success);
  tradeDuration.add(Date.now() - startTime);

  if (!success && res.status !== 400) {
    console.error(`Sell failed: ${res.status} - ${res.body}`);
    errorCounter.add(1);
  }

  return res;
}

/**
 * Test Case: Browse Terminal
 * Simulates user browsing pool list
 */
function browseTerminal() {
  const res = http.get(`${BASE_URL}/api/pools?limit=50&sort=volume`);

  check(res, {
    'terminal browse status 200': (r) => r.status === 200,
    'terminal browse < 1s': (r) => r.timings.duration < 1000,
  });

  if (res.status !== 200) {
    errorCounter.add(1);
  }

  return res;
}

// ============================================================================
// Setup & Teardown
// ============================================================================

/**
 * Setup function (runs once per VU)
 */
export function setup() {
  console.log('🚀 Starting load test...');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  RPC: ${RPC_URL}`);

  // Verify API is reachable
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    console.error('❌ API health check failed');
    return null;
  }

  console.log('✓ API health check passed');
  return { startTime: Date.now() };
}

/**
 * Teardown function (runs once after all VUs finish)
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('\n========================================');
  console.log('Load Test Complete');
  console.log('========================================');
  console.log(`Duration: ${duration}s`);
  console.log('========================================\n');
}

// ============================================================================
// Custom Scenarios (Uncomment to use)
// ============================================================================

// Use the desired scenario by setting export options
// Default: uses options_rampup
export const options = options_rampup;

// To run different scenarios:
// export const options = options_sustained;
// export const options = options_spike;
// export const options = options_stress;

// ============================================================================
// CLI Usage Examples
// ============================================================================

/**
 * Run ramp-up test:
 *   k6 run tests/load-test-scenarios.js
 *
 * Run sustained load test:
 *   k6 run -e SCENARIO=sustained tests/load-test-scenarios.js
 *
 * Run with custom target:
 *   k6 run -e BASE_URL=https://creator.app tests/load-test-scenarios.js
 *
 * Generate HTML report:
 *   k6 run --out json=results.json tests/load-test-scenarios.js
 *   k6-to-junit results.json > report.xml
 *
 * Run with Grafana dashboard:
 *   k6 run --out influxdb=http://localhost:8086/k6 tests/load-test-scenarios.js
 */
