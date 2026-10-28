require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔗 Connecting to Neon PostgreSQL...');

    await client.query(`
      -- Users Table
      CREATE TABLE IF NOT EXISTS users (
        telegram_id VARCHAR(64) PRIMARY KEY,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        username VARCHAR(255),
        wallet_balance NUMERIC(18, 6) DEFAULT 0.000000,
        deposit_balance NUMERIC(18, 2) DEFAULT 0.00,
        total_deposit NUMERIC(18, 2) DEFAULT 0.00,
        total_withdraw NUMERIC(18, 2) DEFAULT 0.00,
        withdraw_address VARCHAR(255) DEFAULT NULL,
        is_address_locked BOOLEAN DEFAULT FALSE,
        daily_mining_rate NUMERIC(18, 4) DEFAULT 0.0500,
        hashrate NUMERIC(18, 2) DEFAULT 1.22,
        purchased_plans JSONB DEFAULT '[]'::jsonb,
        referred_by VARCHAR(64) DEFAULT NULL,
        total_referrals INTEGER DEFAULT 0,
        total_referral_bonus NUMERIC(18, 2) DEFAULT 0.00,
        mined_unclaimed NUMERIC(18, 8) DEFAULT 0.00000000,
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Transactions / History Table
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGSERIAL PRIMARY KEY,
        telegram_id VARCHAR(64) REFERENCES users(telegram_id) ON DELETE CASCADE,
        type VARCHAR(64) NOT NULL,
        amount NUMERIC(18, 6) NOT NULL,
        network VARCHAR(64) DEFAULT 'BEP20',
        tx_hash VARCHAR(255) DEFAULT NULL,
        wallet_address VARCHAR(255) DEFAULT NULL,
        status VARCHAR(64) DEFAULT 'Completed',
        note TEXT DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Referrals Table
      CREATE TABLE IF NOT EXISTS referrals (
        id BIGSERIAL PRIMARY KEY,
        referrer_id VARCHAR(64) NOT NULL,
        referred_id VARCHAR(64) NOT NULL UNIQUE,
        referred_name VARCHAR(255) DEFAULT NULL,
        referred_username VARCHAR(255) DEFAULT NULL,
        deposit_amount NUMERIC(18, 2) DEFAULT 0.00,
        commission_earned NUMERIC(18, 2) DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- High-Speed & Security Indexes
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash_unique ON transactions(LOWER(tx_hash)) WHERE tx_hash IS NOT NULL AND tx_hash != '';
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
      CREATE INDEX IF NOT EXISTS idx_users_withdraw_addr ON users(withdraw_address);
      CREATE INDEX IF NOT EXISTS idx_users_mining_active ON users(is_mining_active, mining_started_at) WHERE is_mining_active = TRUE;
      CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

      -- Migration: 24h mining session tracking & activation
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mining_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_mining_active BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_notified_claim_001 BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_notified_24h_stopped BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_activated_referral BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_in_session NUMERIC(18, 8) DEFAULT 0.00000000;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS has_started_mining BOOLEAN DEFAULT FALSE;

      -- System Settings Table (Persist Admin IDs and Bot State across server restarts)
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Migration: Default base daily mining rate to 0.0500 USDT
      ALTER TABLE users ALTER COLUMN daily_mining_rate SET DEFAULT 0.0500;
      UPDATE users SET daily_mining_rate = 0.0500 WHERE daily_mining_rate = 0.0290;
    `);

    console.log('✅ Neon PostgreSQL Database & Tables initialized successfully!');
  } catch (error) {
    console.error('❌ Neon PostgreSQL initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// High-performance bounded in-memory cache for fast user resolution on /start (100k daily scale)
const activeUserCache = new Map();

// Helper: Get or Create user (Atomic high-speed UPSERT)
async function getOrCreateUser(userData) {
  const { id, first_name = '', last_name = '', username = '', refCode = '', photo_url = null } = userData;
  const telegram_id = id.toString();

  // Fast-path: If user was synced within the last 30 seconds and no referral code is passed, quick return
  const now = Date.now();
  const cached = activeUserCache.get(telegram_id);
  if (cached && (now - cached.time < 30000) && !refCode) {
    return cached.user;
  }

  // Extract clean referral code (e.g. "ref_123456" -> "123456", or direct numeric ID)
  let cleanRef = (refCode || '').toString().trim();
  cleanRef = cleanRef.replace(/^(ref_|start_|invite_)/i, '').trim();
  const digitsMatch = cleanRef.match(/\d{5,}/);
  if (digitsMatch) {
    cleanRef = digitsMatch[0];
  }

  let validReferrer = null;
  if (cleanRef && cleanRef !== telegram_id) {
    validReferrer = cleanRef;
  }

  // Single-query Atomic UPSERT: Handles insertion, update, and referral linking in ONE round-trip!
  const query = `
    INSERT INTO users (telegram_id, first_name, last_name, username, photo_url, referred_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (telegram_id) DO UPDATE SET
      first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), users.first_name),
      last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), users.last_name),
      username = COALESCE(NULLIF(EXCLUDED.username, ''), users.username),
      photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
      referred_by = COALESCE(users.referred_by, EXCLUDED.referred_by),
      last_active_at = NOW()
    RETURNING *`;

  const res = await pool.query(query, [
    telegram_id,
    first_name || 'Miner',
    last_name || '',
    username || '',
    photo_url,
    validReferrer
  ]);

  const user = res.rows[0];

  // Cache user object
  activeUserCache.set(telegram_id, { time: now, user });
  if (activeUserCache.size > 20000) {
    const firstKey = activeUserCache.keys().next().value;
    activeUserCache.delete(firstKey);
  }

  // Record referral asynchronously in background if newly referred
  if (validReferrer && user.referred_by === validReferrer) {
    pool.query(
      `INSERT INTO referrals (referrer_id, referred_id, referred_name, referred_username, has_started_mining)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT (referred_id) DO NOTHING`,
      [validReferrer, telegram_id, `${first_name} ${last_name}`.trim(), username]
    ).catch(e => console.warn('Background referral link notice:', e.message));
  }

  return user;
}

// Helper: Get full user details with history & referrals
async function getUserFullDetails(telegramId) {
  const tid = telegramId.toString();
  const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tid]);
  if (userRes.rows.length === 0) return null;

  const user = userRes.rows[0];

  const txRes = await pool.query(
    'SELECT * FROM transactions WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT 50',
    [tid]
  );

  const refRes = await pool.query(
    `SELECT r.*, u.photo_url, u.first_name, u.last_name, u.username
     FROM referrals r
     LEFT JOIN users u ON r.referred_id = u.telegram_id
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC`,
    [tid]
  );

  // Sync total_referrals count with actual referrals
  const actualRefCount = refRes.rows.length;
  const effectiveTotalRef = Math.max(Number(user.total_referrals || 0), actualRefCount);

  // Calculate live unclaimed mined bonus
  const now = Date.now();
  const SESSION_MS = 24 * 60 * 60 * 1000;
  let liveUnclaimed = Number(user.mined_unclaimed || 0);

  if (user.is_mining_active && user.mining_started_at) {
    const startTime = new Date(user.mining_started_at).getTime();
    const elapsed = now - startTime;
    const dailyRate = Number(user.daily_mining_rate || 0.05);
    const claimedSoFar = Number(user.claimed_in_session || 0);

    if (elapsed < SESSION_MS) {
      const progress = Math.min(1, Math.max(0, elapsed / SESSION_MS));
      const totalSoFar = dailyRate * progress;
      liveUnclaimed += Math.max(0, totalSoFar - claimedSoFar);
    } else {
      // 24h cycle finished while offline
      const remainingFromSession = Math.max(0, dailyRate - claimedSoFar);
      liveUnclaimed += remainingFromSession;
    }
  }

  return {
    ...user,
    total_referrals: effectiveTotalRef,
    live_mined_unclaimed: Number(liveUnclaimed.toFixed(8)),
    transactions: txRes.rows,
    referrals: refRes.rows
  };
}

// Helper: Check if a withdraw address is already registered/locked by another user
async function isAddressAlreadyRegistered(address, excludeTelegramId = null) {
  if (!address) return false;
  let query = 'SELECT telegram_id FROM users WHERE LOWER(withdraw_address) = LOWER($1)';
  const params = [address.trim()];
  if (excludeTelegramId) {
    query += ' AND telegram_id != $2';
    params.push(excludeTelegramId.toString());
  }
  const res = await pool.query(query, params);
  return res.rows.length > 0;
}

// Helper: Lock user withdraw address
async function lockUserWithdrawAddress(telegramId, address) {
  const tid = telegramId.toString();
  await pool.query(
    `UPDATE users 
     SET withdraw_address = $1, is_address_locked = TRUE, updated_at = NOW() 
     WHERE telegram_id = $2`,
    [address.trim(), tid]
  );
}

// Helper: Add Transaction
async function addTransaction({ telegramId, type, amount, network = 'BEP20', txHash = null, walletAddress = null, status = 'Completed', note = null }) {
  const tid = telegramId.toString();
  const res = await pool.query(
    `INSERT INTO transactions (telegram_id, type, amount, network, tx_hash, wallet_address, status, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tid, type, amount, network, txHash, walletAddress, status, note]
  );
  return res.rows[0];
}

// Helper: Credit Deposit & Handle 10% Referral Commission (Atomic Transaction)
async function recordVerifiedDeposit({ telegramId, amount, txHash, network = 'BEP20' }) {
  const tid = telegramId.toString();
  const numAmount = Number(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Invalid deposit amount');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Strict case-insensitive duplicate check inside transaction
    if (txHash) {
      const existTx = await client.query(
        'SELECT id FROM transactions WHERE LOWER(tx_hash) = LOWER($1)',
        [txHash]
      );
      if (existTx.rows.length > 0) {
        throw new Error('Transaction hash already claimed!');
      }
    }

    // 2. Update user deposit balance & total deposit
    const updateRes = await client.query(
      `UPDATE users 
       SET deposit_balance = deposit_balance + $1,
           total_deposit = total_deposit + $1,
           updated_at = NOW()
       WHERE telegram_id = $2
       RETURNING *`,
      [numAmount, tid]
    );

    const updatedUser = updateRes.rows[0];

    // 3. Record Deposit Transaction
    await client.query(
      `INSERT INTO transactions (telegram_id, type, amount, network, tx_hash, status, note)
       VALUES ($1, 'deposit', $2, $3, $4, 'Completed', $5)`,
      [tid, numAmount, network, txHash, `USDT Deposit verified via ${network}`]
    );

    // 4. Referral commission ($0.10 flat to referrer's withdrawable balance)
    if (updatedUser && updatedUser.referred_by) {
      const commission = 0.10;
      const referrerId = updatedUser.referred_by;

      await client.query(
        `UPDATE users
         SET wallet_balance = wallet_balance + $1,
             total_referral_bonus = total_referral_bonus + $1,
             updated_at = NOW()
         WHERE telegram_id = $2`,
        [commission, referrerId]
      );

      await client.query(
        `UPDATE referrals 
         SET deposit_amount = deposit_amount + $1,
             commission_earned = commission_earned + $2
         WHERE referrer_id = $3 AND referred_id = $4`,
        [numAmount, commission, referrerId, tid]
      );

      await client.query(
        `INSERT INTO transactions (telegram_id, type, amount, network, status, note)
         VALUES ($1, 'referral_bonus', $2, 'BEP20', 'Completed', $3)`,
        [referrerId, commission, `Referral commission ($0.10) from deposit by user ${tid}`]
      );
    }

    await client.query('COMMIT');
    return updatedUser;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Helper: Record Withdrawal (Pending) with SQL Transaction & Row-level Locking (Blocks Inspect Element & Double-Spending)
async function recordWithdrawalRequest({ telegramId, amount, address, network = 'BEP20' }) {
  const tid = telegramId.toString();
  const numAmount = Number(amount);

  if (isNaN(numAmount) || numAmount < 0.1) {
    throw new Error('Minimum withdrawal is 0.10 USDT!');
  }

  const cleanAddress = (address || '').trim();
  if (!cleanAddress.startsWith('0x') || cleanAddress.length < 38) {
    throw new Error('Please enter a valid BEP20 wallet address!');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock user row exclusively to prevent race conditions & double withdrawals
    const userRes = await client.query(
      'SELECT wallet_balance, withdraw_address, is_address_locked, is_banned FROM users WHERE telegram_id = $1 FOR UPDATE',
      [tid]
    );
    if (userRes.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userRes.rows[0];
    if (user.is_banned) {
      throw new Error('Your account has been banned! Please contact support.');
    }

    // 2. Strict Server-Side Balance Check (Blocks Inspect Element manipulations 100%)
    const currentBalance = Number(user.wallet_balance || 0);
    if (currentBalance < numAmount) {
      throw new Error(`Insufficient balance! Your balance is $${currentBalance.toFixed(4)} USDT, but requested $${numAmount.toFixed(4)} USDT`);
    }

    // 3. Address Lock Check: If account has a locked address, it CANNOT be changed
    if (user.is_address_locked && user.withdraw_address) {
      if (user.withdraw_address.trim().toLowerCase() !== cleanAddress.toLowerCase()) {
        throw new Error(`Your account is locked to this address: ${user.withdraw_address}. You cannot withdraw to a different address. Please ask admin to reset.`);
      }
    }

    // 4. Atomic Balance Deduction (wallet_balance >= numAmount enforced at DB level)
    const updateRes = await client.query(
      `UPDATE users 
       SET wallet_balance = wallet_balance - $1,
           total_withdraw = total_withdraw + $1,
           withdraw_address = COALESCE(withdraw_address, $2),
           is_address_locked = TRUE,
           updated_at = NOW()
       WHERE telegram_id = $3 AND wallet_balance >= $1
       RETURNING *`,
      [numAmount, cleanAddress, tid]
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Insufficient balance or already withdrawn.');
    }

    // 5. Insert Pending Withdrawal Transaction
    const txRes = await client.query(
      `INSERT INTO transactions (telegram_id, type, amount, network, wallet_address, status, note)
       VALUES ($1, 'withdraw', $2, $3, $4, 'Pending', 'Withdrawal submitted (BEP20)')
       RETURNING *`,
      [tid, numAmount, network, cleanAddress]
    );

    await client.query('COMMIT');
    return { user: updateRes.rows[0], transaction: txRes.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Helper: Buy Power Plan using Deposit Balance
async function recordPlanPurchase({ telegramId, planId, planName, planPrice, dailyProfit, hashrateBonus = 1.0 }) {
  const tid = telegramId.toString();
  const price = Number(planPrice);

  const userRes = await pool.query('SELECT deposit_balance, purchased_plans, daily_mining_rate, hashrate FROM users WHERE telegram_id = $1', [tid]);
  if (userRes.rows.length === 0) throw new Error('User not found');

  const user = userRes.rows[0];
  if (Number(user.deposit_balance) < price) {
    throw new Error('Insufficient deposit balance! Please deposit USDT.');
  }

  let currentPlans = [];
  if (Array.isArray(user.purchased_plans)) {
    currentPlans = [...user.purchased_plans];
  } else if (typeof user.purchased_plans === 'string') {
    try {
      currentPlans = JSON.parse(user.purchased_plans);
      if (!Array.isArray(currentPlans)) currentPlans = [];
    } catch (e) {
      currentPlans = [];
    }
  }
  currentPlans.push(planId);

  const newDaily = Number((Number(user.daily_mining_rate) + Number(dailyProfit)).toFixed(4));
  const newHash = Number((Number(user.hashrate) + Number(hashrateBonus)).toFixed(2));

  const updateRes = await pool.query(
    `UPDATE users 
     SET deposit_balance = deposit_balance - $1,
         purchased_plans = $2::jsonb,
         daily_mining_rate = $3,
         hashrate = $4,
         updated_at = NOW()
     WHERE telegram_id = $5
     RETURNING *`,
    [price, JSON.stringify(currentPlans), newDaily, newHash, tid]
  );

  await addTransaction({
    telegramId: tid,
    type: 'plan_purchase',
    amount: price,
    network: 'Deposit Balance',
    status: 'Completed',
    note: `Purchased ${planName}`
  });

  return updateRes.rows[0];
}

// Helper: Start 24h Mining Cycle & Activate Referral on first mining start
async function startUserMining(telegramId) {
  const tid = telegramId.toString();

  let activatedReferrerId = null;
  let userDetails = null;

  const userCheck = await pool.query(
    'SELECT telegram_id, first_name, last_name, username, referred_by, has_activated_referral, mined_unclaimed, is_mining_active, mining_started_at, daily_mining_rate, claimed_in_session FROM users WHERE telegram_id = $1',
    [tid]
  );

  let uncollectedToCredit = 0;

  if (userCheck.rows.length > 0) {
    const u = userCheck.rows[0];
    userDetails = u;

    // Calculate any uncollected mining balance from previous session so it is never lost!
    const priorUnclaimed = Number(u.mined_unclaimed || 0);
    let sessionAccrued = 0;
    if (u.mining_started_at) {
      const startTime = new Date(u.mining_started_at).getTime();
      const elapsed = Math.max(0, Date.now() - startTime);
      const SESSION_MS = 24 * 60 * 60 * 1000;
      const progress = Math.min(1, elapsed / SESSION_MS);
      const dailyRate = Number(u.daily_mining_rate || 0.05);
      const claimedSoFar = Number(u.claimed_in_session || 0);
      sessionAccrued = Math.max(0, (dailyRate * progress) - claimedSoFar);
    }
    uncollectedToCredit = Number((priorUnclaimed + sessionAccrued).toFixed(6));

    // ONLY count referral if this user was referred AND has not started mining before!
    if (u.referred_by && !u.has_activated_referral) {
      activatedReferrerId = u.referred_by;

      // 1. Mark user as activated so it NEVER counts again
      await pool.query(
        'UPDATE users SET has_activated_referral = TRUE WHERE telegram_id = $1',
        [tid]
      );

      // 2. Mark in referrals table
      await pool.query(
        'UPDATE referrals SET has_started_mining = TRUE WHERE referred_id = $1',
        [tid]
      );

      // 3. Increment referrer total_referrals, add $0.005/day to daily_mining_rate, and boost hashrate!
      await pool.query(
        `UPDATE users 
         SET total_referrals = total_referrals + 1,
             daily_mining_rate = daily_mining_rate + 0.0050,
             hashrate = hashrate + 0.10,
             updated_at = NOW()
         WHERE telegram_id = $1`,
        [activatedReferrerId]
      );
    }
  }

  // Credit any uncollected balance from previous session to wallet_balance so it is never lost!
  const res = await pool.query(
    `UPDATE users 
     SET wallet_balance = wallet_balance + $1,
         mining_started_at = NOW(),
         is_mining_active = TRUE,
         mined_unclaimed = 0,
         claimed_in_session = 0,
         has_notified_claim_001 = FALSE,
         has_notified_24h_stopped = FALSE,
         updated_at = NOW()
     WHERE telegram_id = $2
     RETURNING *`,
    [uncollectedToCredit, tid]
  );

  if (uncollectedToCredit > 0) {
    await pool.query(
      `INSERT INTO transactions (telegram_id, type, amount, network, status, note)
       VALUES ($1, 'claim', $2, 'Internal', 'Completed', 'Previous session mining reward credited on new cycle start')`,
      [tid, uncollectedToCredit]
    );
  }

  return {
    user: res.rows[0],
    activatedReferrerId,
    referredUser: userDetails
  };
}

// Helper: Claim Mined Balance and optionally restart 24h mining (Protected against inspect element and fake claims)
async function claimMinedReward(telegramId, amount, restart = false) {
  const tid = telegramId.toString();
  const amt = Number(amount);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch and lock current user state to prevent concurrent double-claims
    const uRes = await client.query(
      'SELECT telegram_id, is_mining_active, mining_started_at, mined_unclaimed, claimed_in_session, daily_mining_rate, wallet_balance, is_banned FROM users WHERE telegram_id = $1 FOR UPDATE',
      [tid]
    );
    if (uRes.rows.length === 0) throw new Error('User not found');
    const user = uRes.rows[0];

    if (user.is_banned) {
      throw new Error('Your account has been banned! Please contact support.');
    }

    // SERVER-SIDE STRICT REWARD ACCRUAL CALCULATION:
    // Protects against client-side Inspect Element & fake POST payloads
    const now = Date.now();
    const SESSION_MS = 24 * 60 * 60 * 1000;
    const startTime = user.mining_started_at ? new Date(user.mining_started_at).getTime() : null;
    const elapsed = startTime ? Math.max(0, now - startTime) : 0;
    const dailyRate = Number(user.daily_mining_rate || 0.05);
    const claimedSoFar = Number(user.claimed_in_session || 0);

    let accruedInSession = 0;
    if (user.is_mining_active && startTime) {
      const progress = Math.min(1, elapsed / SESSION_MS);
      accruedInSession = Math.max(0, (dailyRate * progress) - claimedSoFar);
    }

    const priorUnclaimed = Number(user.mined_unclaimed || 0);
    const totalClaimable = Number((accruedInSession + priorUnclaimed).toFixed(6));

    if (totalClaimable < 0.0001) {
      throw new Error('Insufficient mining balance to claim! (Minimum claim threshold is 0.0001 USDT)');
    }

    // STRICT CLAMPING: Client CANNOT claim more than mathematically accrued on the server!
    const verifiedAmount = (amt > 0 && amt <= totalClaimable) ? amt : totalClaimable;

    // Properly split deduction between prior unclaimed and current session accrual
    const fromPrior = Math.min(priorUnclaimed, verifiedAmount);
    const fromSession = Number(Math.max(0, verifiedAmount - fromPrior).toFixed(6));
    const newMinedUnclaimed = Number(Math.max(0, priorUnclaimed - fromPrior).toFixed(6));
    const newClaimedInSession = Number((claimedSoFar + fromSession).toFixed(6));

    let updateQuery = '';
    let params = [];

    const isStillInSession = user.is_mining_active && startTime && (elapsed < SESSION_MS);

    if (restart) {
      // Claim verified amount and restart fresh 24h cycle
      updateQuery = `
        UPDATE users 
        SET wallet_balance = wallet_balance + $1,
            mined_unclaimed = 0,
            claimed_in_session = 0,
            is_mining_active = TRUE,
            mining_started_at = NOW(),
            has_notified_claim_001 = FALSE,
            has_notified_24h_stopped = FALSE,
            updated_at = NOW()
        WHERE telegram_id = $2
        RETURNING *`;
      params = [verifiedAmount, tid];
    } else if (isStillInSession) {
      // Intermediate claim during active session: keep mining running!
      updateQuery = `
        UPDATE users 
        SET wallet_balance = wallet_balance + $1,
            mined_unclaimed = $2,
            claimed_in_session = $3,
            has_notified_claim_001 = FALSE,
            updated_at = NOW()
        WHERE telegram_id = $4
        RETURNING *`;
      params = [verifiedAmount, newMinedUnclaimed, newClaimedInSession, tid];
    } else {
      // 24h cycle finished: claim and stop mining until user starts new cycle
      updateQuery = `
        UPDATE users 
        SET wallet_balance = wallet_balance + $1,
            mined_unclaimed = $2,
            claimed_in_session = 0,
            is_mining_active = FALSE,
            mining_started_at = NULL,
            has_notified_claim_001 = FALSE,
            has_notified_24h_stopped = TRUE,
            updated_at = NOW()
        WHERE telegram_id = $3
        RETURNING *`;
      params = [verifiedAmount, newMinedUnclaimed, tid];
    }

    const res = await client.query(updateQuery, params);

    // Record Transaction
    await client.query(
      `INSERT INTO transactions (telegram_id, type, amount, network, status, note)
       VALUES ($1, 'claim', $2, 'Internal', 'Completed', 'Mining reward claimed to main wallet')`,
      [tid, verifiedAmount]
    );

    await client.query('COMMIT');
    return res.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Helper: Backwards-compatible recordMiningClaim
async function recordMiningClaim({ telegramId, amount, restart = false }) {
  return claimMinedReward(telegramId, amount, restart);
}

// Helper: Get Bot Global Statistics (All Users, Total Balance, Total Deposit, Total Withdraw)
async function getBotGlobalStats() {
  const res = await pool.query(`
    SELECT 
      COUNT(*)::INT AS total_users,
      COALESCE(SUM(wallet_balance), 0)::NUMERIC(18, 2) AS total_user_wallet_balance,
      COALESCE(SUM(deposit_balance), 0)::NUMERIC(18, 2) AS total_user_deposit_balance,
      COALESCE(SUM(total_deposit), 0)::NUMERIC(18, 2) AS total_bot_deposit,
      COALESCE(SUM(total_withdraw), 0)::NUMERIC(18, 2) AS total_bot_withdraw,
      COALESCE(SUM(total_referral_bonus), 0)::NUMERIC(18, 2) AS total_referral_commissions
    FROM users;
  `);

  const txRes = await pool.query(`
    SELECT 
      COUNT(*)::INT AS total_transactions,
      COUNT(*) FILTER (WHERE type = 'deposit')::INT AS total_deposits_count,
      COUNT(*) FILTER (WHERE type = 'withdraw')::INT AS total_withdrawals_count,
      COUNT(*) FILTER (WHERE type = 'withdraw' AND status = 'Pending')::INT AS pending_withdrawals_count
    FROM transactions;
  `);

  return {
    ...res.rows[0],
    ...txRes.rows[0]
  };
}

// Helper: Get single transaction with user details
async function getTransactionById(txId) {
  const res = await pool.query(`
    SELECT t.*, u.first_name, u.last_name, u.username, u.wallet_balance, u.deposit_balance, u.total_referrals
    FROM transactions t
    JOIN users u ON t.telegram_id = u.telegram_id
    WHERE t.id = $1
  `, [txId]);
  return res.rows[0] || null;
}

// Helper: Get list of pending withdrawals
async function getPendingWithdrawals() {
  const res = await pool.query(`
    SELECT t.*, u.first_name, u.last_name, u.username, u.wallet_balance, u.deposit_balance, u.total_referrals
    FROM transactions t
    JOIN users u ON t.telegram_id = u.telegram_id
    WHERE t.type = 'withdraw' AND t.status = 'Pending'
    ORDER BY t.created_at DESC
  `);
  return res.rows;
}

// Helper: Get recent deposits
async function getRecentDeposits(limit = 10) {
  const res = await pool.query(`
    SELECT t.*, u.first_name, u.last_name, u.username, u.referred_by
    FROM transactions t
    JOIN users u ON t.telegram_id = u.telegram_id
    WHERE t.type = 'deposit'
    ORDER BY t.created_at DESC
    LIMIT $1
  `, [limit]);
  return res.rows;
}

// Helper: Approve withdrawal
async function approveWithdrawal(txId, payoutTxHash = null) {
  const hash = payoutTxHash || ('0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''));
  const updateRes = await pool.query(`
    UPDATE transactions 
    SET status = 'Completed', tx_hash = $1
    WHERE id = $2 AND status = 'Pending'
    RETURNING *
  `, [hash, txId]);

  if (updateRes.rows.length === 0) {
    throw new Error('Withdrawal request not found or already processed.');
  }

  const tx = updateRes.rows[0];
  const user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tx.telegram_id]);
  return { transaction: tx, user: user.rows[0] };
}

// Helper: Reject withdrawal and refund balance
async function rejectWithdrawal(txId, reason = 'Rejected by Admin') {
  const checkRes = await pool.query('SELECT * FROM transactions WHERE id = $1 AND status = \'Pending\'', [txId]);
  if (checkRes.rows.length === 0) {
    throw new Error('Withdrawal request not found or already processed.');
  }

  const tx = checkRes.rows[0];
  const amt = Number(tx.amount);

  // Refund user's wallet_balance and decrease total_withdraw
  const userUpdate = await pool.query(`
    UPDATE users 
    SET wallet_balance = wallet_balance + $1,
        total_withdraw = GREATEST(0, total_withdraw - $1),
        updated_at = NOW()
    WHERE telegram_id = $2
    RETURNING *
  `, [amt, tx.telegram_id]);

  // Mark transaction as Rejected
  const txUpdate = await pool.query(`
    UPDATE transactions
    SET status = 'Rejected', note = $1
    WHERE id = $2
    RETURNING *
  `, [reason, txId]);

  return { transaction: txUpdate.rows[0], user: userUpdate.rows[0] };
}

// Admin Helper: Search user by username, telegram_id, or name
async function searchUser(query) {
  const clean = (query || '').toString().trim().replace('@', '');
  if (!clean) return [];
  const res = await pool.query(
    `SELECT * FROM users 
     WHERE telegram_id = $1 
        OR LOWER(username) = LOWER($1) 
        OR LOWER(first_name) LIKE LOWER($2) 
     ORDER BY created_at DESC 
     LIMIT 5`,
    [clean, `%${clean}%`]
  );
  return res.rows;
}

// Admin Helper: Get Top 10 Referrers
async function getTopReferrers(limit = 10) {
  const res = await pool.query(
    `SELECT telegram_id, first_name, username, total_referrals, total_referral_bonus, hashrate 
     FROM users 
     WHERE total_referrals > 0 
     ORDER BY total_referrals DESC 
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

// Admin Helper: Get Top 10 Investors
async function getTopInvestors(limit = 10) {
  const res = await pool.query(
    `SELECT telegram_id, first_name, username, total_deposit, deposit_balance, hashrate 
     FROM users 
     WHERE total_deposit > 0 
     ORDER BY total_deposit DESC 
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

// Admin Helper: Get User Transactions
async function getUserTransactions(telegramId, limit = 10) {
  const res = await pool.query(
    `SELECT * FROM transactions 
     WHERE telegram_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [telegramId.toString(), limit]
  );
  return res.rows;
}

// Admin Helper: Get all user IDs for Broadcast
async function getAllUserTelegramIds() {
  const res = await pool.query(`SELECT telegram_id FROM users`);
  return res.rows.map(r => r.telegram_id);
}

// Admin Helper: Reset user locked BEP20 address
async function resetUserWithdrawAddress(telegramId) {
  const res = await pool.query(
    `UPDATE users SET withdraw_address = NULL, updated_at = NOW() WHERE telegram_id = $1 RETURNING *`,
    [telegramId.toString()]
  );
  return res.rows[0];
}

// Admin Helper: Adjust User Balance (Credit/Debit)
async function adjustUserBalance(telegramId, amount, type = 'wallet_balance') {
  const num = Number(amount);
  const column = type === 'deposit_balance' ? 'deposit_balance' : 'wallet_balance';
  const extraDepositUpdate = (type === 'deposit_balance' && num > 0) ? ', total_deposit = total_deposit + $1' : '';

  const res = await pool.query(
    `UPDATE users 
     SET ${column} = GREATEST(0, ${column} + $1)${extraDepositUpdate},
         updated_at = NOW() 
     WHERE telegram_id = $2 
     RETURNING *`,
    [num, telegramId.toString()]
  );

  if (res.rows.length === 0) throw new Error('User not found in database');

  // Record audit transaction
  await addTransaction({
    telegramId: telegramId.toString(),
    type: type === 'deposit_balance' ? 'deposit' : 'bonus',
    amount: Math.abs(num),
    network: 'Admin Adjustment',
    status: 'Completed',
    note: `Admin ${num >= 0 ? 'credited' : 'debited'} $${Math.abs(num).toFixed(2)} USDT to ${type === 'deposit_balance' ? 'Deposit' : 'Wallet'} Balance`
  });

  return res.rows[0];
}

// Admin Helper: Gift a Mining Plan directly to a user
async function giftMiningPlanToUser({ telegramId, planId, planName, dailyProfit, hashrateBonus, adminUsername }) {
  const tid = telegramId.toString();
  const userRes = await pool.query('SELECT purchased_plans, daily_mining_rate, hashrate FROM users WHERE telegram_id = $1', [tid]);
  if (userRes.rows.length === 0) throw new Error('User not found in database');

  const user = userRes.rows[0];
  let currentPlans = [];
  if (Array.isArray(user.purchased_plans)) {
    currentPlans = [...user.purchased_plans];
  } else if (typeof user.purchased_plans === 'string') {
    try {
      currentPlans = JSON.parse(user.purchased_plans);
      if (!Array.isArray(currentPlans)) currentPlans = [];
    } catch (e) {
      currentPlans = [];
    }
  }

  currentPlans.push(planId);

  const newDaily = Number((Number(user.daily_mining_rate || 0) + Number(dailyProfit || 0)).toFixed(4));
  const newHash = Number((Number(user.hashrate || 0) + Number(hashrateBonus || 0)).toFixed(2));

  const updateRes = await pool.query(
    `UPDATE users 
     SET purchased_plans = $1::jsonb,
         daily_mining_rate = $2,
         hashrate = $3,
         updated_at = NOW()
     WHERE telegram_id = $4
     RETURNING *`,
    [JSON.stringify(currentPlans), newDaily, newHash, tid]
  );

  await addTransaction({
    telegramId: tid,
    type: 'plan_gift',
    amount: 0,
    network: 'Admin Gift',
    status: 'Completed',
    note: `Gifted ${planName} by Admin @${adminUsername || 'admin'}`
  });

  return updateRes.rows[0];
}

// Helper: Get system setting from DB
async function getSystemSetting(key, defaultValue = null) {
  try {
    const res = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      return res.rows[0].value;
    }
  } catch (err) {
    // table may not exist yet during migration
  }
  return defaultValue;
}

// Helper: Set system setting in DB
async function setSystemSetting(key, value) {
  try {
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, strVal]
    );
  } catch (err) {
    console.error('Error saving system setting:', err.message);
  }
}

// Helper: Get all admin Telegram IDs (from system_settings and known admin usernames in users table)
async function getAdminTelegramIds(authorizedUsernames = ['alhajbf2']) {
  const ids = new Set();
  try {
    const rawVal = await getSystemSetting('admin_chat_ids');
    if (rawVal) {
      try {
        const parsed = JSON.parse(rawVal);
        if (Array.isArray(parsed)) {
          parsed.forEach(id => {
            if (id && String(id).trim()) ids.add(String(id).trim());
          });
        }
      } catch (e) {
        if (rawVal.trim()) ids.add(rawVal.trim());
      }
    }

    // Auto-resolve known admin usernames from users table
    const cleanNames = authorizedUsernames.map(u => String(u || '').toLowerCase().replace('@', '').trim()).filter(Boolean);
    if (cleanNames.length > 0) {
      const uRes = await pool.query(
        'SELECT telegram_id FROM users WHERE LOWER(username) = ANY($1)',
        [cleanNames]
      );
      uRes.rows.forEach(r => {
        if (r.telegram_id) ids.add(String(r.telegram_id).trim());
      });
    }
  } catch (err) {
    console.error('Error in getAdminTelegramIds:', err.message);
  }
  return Array.from(ids);
}

module.exports = {
  pool,
  initDatabase,
  getOrCreateUser,
  getUserFullDetails,
  isAddressAlreadyRegistered,
  lockUserWithdrawAddress,
  addTransaction,
  recordVerifiedDeposit,
  recordWithdrawalRequest,
  recordPlanPurchase,
  recordMiningClaim,
  startUserMining,
  claimMinedReward,
  getBotGlobalStats,
  getTransactionById,
  getPendingWithdrawals,
  getRecentDeposits,
  approveWithdrawal,
  rejectWithdrawal,
  searchUser,
  getTopReferrers,
  getTopInvestors,
  getUserTransactions,
  getAllUserTelegramIds,
  resetUserWithdrawAddress,
  adjustUserBalance,
  giftMiningPlanToUser,
  getSystemSetting,
  setSystemSetting,
  getAdminTelegramIds
};
