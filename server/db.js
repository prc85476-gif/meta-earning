require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
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

      -- Indexes for high-speed queries
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
      CREATE INDEX IF NOT EXISTS idx_users_withdraw_addr ON users(withdraw_address);

      -- Migration: 24h mining session tracking & activation
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mining_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_mining_active BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_notified_claim_001 BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_notified_24h_stopped BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_activated_referral BOOLEAN DEFAULT FALSE;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS has_started_mining BOOLEAN DEFAULT FALSE;

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

// Helper: Get or Create user
async function getOrCreateUser(userData) {
  const { id, first_name = '', last_name = '', username = '', refCode = '' } = userData;
  const telegram_id = id.toString();

  // Extract clean referral code (e.g. "ref_123456" -> "123456")
  let cleanRef = (refCode || '').toString().replace(/^ref_?/, '').trim();
  let validReferrer = null;
  if (cleanRef && cleanRef !== telegram_id) {
    const refCheck = await pool.query('SELECT telegram_id FROM users WHERE telegram_id = $1', [cleanRef]);
    if (refCheck.rows.length > 0) {
      validReferrer = cleanRef;
    } else if (/^\d+$/.test(cleanRef)) {
      // Auto-create placeholder for referrer if not yet created so referral is never lost
      await pool.query(
        `INSERT INTO users (telegram_id, first_name, username) VALUES ($1, 'Referrer', 'user') ON CONFLICT DO NOTHING`,
        [cleanRef]
      );
      validReferrer = cleanRef;
    }
  }

  const selectRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegram_id]);
  if (selectRes.rows.length > 0) {
    const existing = selectRes.rows[0];
    // If user already existed without a referrer and now provided a valid referrer, link them!
    if (!existing.referred_by && validReferrer) {
      await pool.query(
        `UPDATE users SET referred_by = $1 WHERE telegram_id = $2`,
        [validReferrer, telegram_id]
      );
      try {
        await pool.query(
          `INSERT INTO referrals (referrer_id, referred_id, referred_name, referred_username, has_started_mining)
           VALUES ($1, $2, $3, $4, FALSE)
           ON CONFLICT (referred_id) DO NOTHING`,
          [validReferrer, telegram_id, `${first_name} ${last_name}`.trim(), username]
        );
        // Note: total_referrals is NOT incremented on /start. Only incremented when user starts mining!
      } catch (e) {
        console.error('Error linking referral for existing user:', e.message);
      }
    }

    // Update name/username if changed
    await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, username = $3, last_active_at = NOW() WHERE telegram_id = $4`,
      [first_name, last_name, username, telegram_id]
    );

    const refreshed = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegram_id]);
    return refreshed.rows[0];
  }

  const insertRes = await pool.query(
    `INSERT INTO users (telegram_id, first_name, last_name, username, referred_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [telegram_id, first_name, last_name, username, validReferrer]
  );

  if (validReferrer) {
    try {
      await pool.query(
        `INSERT INTO referrals (referrer_id, referred_id, referred_name, referred_username, has_started_mining)
         VALUES ($1, $2, $3, $4, FALSE)
         ON CONFLICT (referred_id) DO NOTHING`,
        [validReferrer, telegram_id, `${first_name} ${last_name}`.trim(), username]
      );
      // Note: total_referrals is NOT incremented on /start. Only incremented when user starts mining!
    } catch (e) {
      console.error('Error recording referral:', e.message);
    }
  }

  return insertRes.rows[0];
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

  return {
    ...user,
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

// Helper: Credit Deposit & Handle 10% Referral Commission
async function recordVerifiedDeposit({ telegramId, amount, txHash, network = 'BEP20' }) {
  const tid = telegramId.toString();
  const numAmount = Number(amount);

  // Check if txHash already used
  if (txHash) {
    const existTx = await pool.query('SELECT id FROM transactions WHERE tx_hash = $1', [txHash]);
    if (existTx.rows.length > 0) {
      throw new Error('এই Transaction Hash ইতিমধ্যে ব্যবহার করা হয়েছে!');
    }
  }

  // Update user deposit balance & total deposit
  const updateRes = await pool.query(
    `UPDATE users 
     SET deposit_balance = deposit_balance + $1,
         total_deposit = total_deposit + $1,
         updated_at = NOW()
     WHERE telegram_id = $2
     RETURNING *`,
    [numAmount, tid]
  );

  const updatedUser = updateRes.rows[0];

  // Record Deposit Transaction
  await addTransaction({
    telegramId: tid,
    type: 'deposit',
    amount: numAmount,
    network,
    txHash,
    status: 'Completed',
    note: `USDT Deposit verified via ${network}`
  });

  // When a referred user deposits, give flat $0.10 commission to referrer's WITHDRAWABLE balance
  if (updatedUser && updatedUser.referred_by) {
    const commission = 0.10; // Fixed $0.10 reward to referrer on deposit, no matter the deposit amount
    const referrerId = updatedUser.referred_by;
    await pool.query(
      `UPDATE users
       SET wallet_balance = wallet_balance + $1,
           total_referral_bonus = total_referral_bonus + $1,
           updated_at = NOW()
       WHERE telegram_id = $2`,
      [commission, referrerId]
    );

    await pool.query(
      `UPDATE referrals 
       SET deposit_amount = deposit_amount + $1,
           commission_earned = commission_earned + $2
       WHERE referrer_id = $3 AND referred_id = $4`,
      [numAmount, commission, referrerId, tid]
    );

    await addTransaction({
      telegramId: referrerId,
      type: 'referral_bonus',
      amount: commission,
      network: 'BEP20',
      status: 'Completed',
      note: `Referral commission ($0.10) from deposit by user ${tid}`
    });
  }

  return updatedUser;
}

// Helper: Record Withdrawal (Pending)
async function recordWithdrawalRequest({ telegramId, amount, address, network = 'BEP20' }) {
  const tid = telegramId.toString();
  const numAmount = Number(amount);

  // Check balance
  const userRes = await pool.query('SELECT wallet_balance, withdraw_address, is_address_locked FROM users WHERE telegram_id = $1', [tid]);
  if (userRes.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = userRes.rows[0];
  if (Number(user.wallet_balance) < numAmount) {
    throw new Error('অপর্যাপ্ত ব্যালেন্স! (Insufficient withdrawable balance)');
  }

  // Deduct from wallet balance and increase total_withdraw
  const updateRes = await pool.query(
    `UPDATE users 
     SET wallet_balance = wallet_balance - $1,
         total_withdraw = total_withdraw + $1,
         withdraw_address = COALESCE(withdraw_address, $2),
         is_address_locked = TRUE,
         updated_at = NOW()
     WHERE telegram_id = $3
     RETURNING *`,
    [numAmount, address.trim(), tid]
  );

  // Add transaction with status 'Pending'
  const tx = await addTransaction({
    telegramId: tid,
    type: 'withdraw',
    amount: numAmount,
    network,
    walletAddress: address.trim(),
    status: 'Pending',
    note: `Withdrawal submitted (BEP20)`
  });

  return { user: updateRes.rows[0], transaction: tx };
}

// Helper: Buy Power Plan using Deposit Balance
async function recordPlanPurchase({ telegramId, planId, planName, planPrice, dailyProfit, hashrateBonus = 1.0 }) {
  const tid = telegramId.toString();
  const price = Number(planPrice);

  const userRes = await pool.query('SELECT deposit_balance, purchased_plans, daily_mining_rate, hashrate FROM users WHERE telegram_id = $1', [tid]);
  if (userRes.rows.length === 0) throw new Error('User not found');

  const user = userRes.rows[0];
  if (Number(user.deposit_balance) < price) {
    throw new Error('ডিপোজিট ব্যালেন্স অপ্রতুল! দয়া করে ডিপোজিট করুন। (Insufficient Deposit Balance)');
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
    'SELECT telegram_id, first_name, last_name, username, referred_by, has_activated_referral FROM users WHERE telegram_id = $1',
    [tid]
  );

  if (userCheck.rows.length > 0) {
    const u = userCheck.rows[0];
    userDetails = u;
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

  const res = await pool.query(
    `UPDATE users 
     SET mining_started_at = NOW(),
         is_mining_active = TRUE,
         mined_unclaimed = 0,
         has_notified_claim_001 = FALSE,
         has_notified_24h_stopped = FALSE,
         updated_at = NOW()
     WHERE telegram_id = $1
     RETURNING *`,
    [tid]
  );

  return {
    user: res.rows[0],
    activatedReferrerId,
    referredUser: userDetails
  };
}

// Helper: Claim Mined Balance and optionally restart 24h mining
async function claimMinedReward(telegramId, amount, restart = false) {
  const tid = telegramId.toString();
  const amt = Number(amount);
  if (amt <= 0) throw new Error('Invalid claim amount');

  const res = await pool.query(
    `UPDATE users 
     SET wallet_balance = wallet_balance + $1,
         mined_unclaimed = 0,
         is_mining_active = $2,
         mining_started_at = CASE WHEN $2 = TRUE THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE telegram_id = $3
     RETURNING *`,
    [amt, restart, tid]
  );

  await addTransaction({
    telegramId: tid,
    type: 'claim',
    amount: amt,
    network: 'Internal',
    status: 'Completed',
    note: '24-hour mining reward claimed to main wallet'
  });

  return res.rows[0];
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
  giftMiningPlanToUser
};
