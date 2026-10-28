const fs = require('fs');
const path = require('path');

// Official Configuration
const OFFICIAL_DEPOSIT_ADDRESS = '0xf8e3Ea58EDB3719D934E1C2Bef4d160C1772FA81'.toLowerCase();
const USDT_BEP20_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'.toLowerCase();
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MINIMUM_DEPOSIT_USDT = 2.95; // Allow for slight exchange withdrawal fee deduction (so 3.00 is always accepted)

// High-speed, official BSC RPC Endpoints with automatic fallback
const BSC_RPC_ENDPOINTS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://binance.llamarpc.com',
  'https://rpc.ankr.com/bsc',
  'https://1rpc.io/bnb',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc.publicnode.com'
];

// Persistent storage for used transaction hashes (Prevents duplicate reuse!)
const DATA_DIR = path.join(__dirname, 'data');
const USED_TX_FILE = path.join(DATA_DIR, 'used_transactions.json');

function initUsedTransactionsStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(USED_TX_FILE)) {
      fs.writeFileSync(USED_TX_FILE, JSON.stringify({}, null, 2), 'utf8');
      return {};
    }
    const content = fs.readFileSync(USED_TX_FILE, 'utf8');
    return JSON.parse(content || '{}');
  } catch (err) {
    console.error('Error loading used_transactions.json:', err.message);
    return {};
  }
}

let usedTransactions = initUsedTransactionsStore();

function markTransactionAsUsed(txHash, details) {
  usedTransactions[txHash.toLowerCase()] = {
    ...details,
    creditedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(USED_TX_FILE, JSON.stringify(usedTransactions, null, 2), 'utf8');
  } catch (err) {
    console.error('Error persisting used_transactions.json:', err.message);
  }
}

function isTransactionAlreadyUsed(txHash) {
  const key = txHash.toLowerCase();
  if (usedTransactions[key]) return true;
  try {
    if (fs.existsSync(USED_TX_FILE)) {
      const data = JSON.parse(fs.readFileSync(USED_TX_FILE, 'utf8') || '{}');
      if (data[key]) {
        usedTransactions[key] = data[key];
        return true;
      }
    }
  } catch (e) {}
  return false;
}

/**
 * Call BSC JSON-RPC with automatic failover across multiple nodes
 */
async function callBscRpc(method, params) {
  let lastError = null;

  for (const rpcUrl of BSC_RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} from ${rpcUrl}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'RPC Error');
      }

      return data.result;
    } catch (err) {
      lastError = err;
      // Try next endpoint in list
    }
  }

  throw new Error(`All BSC RPC endpoints failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
}

/**
 * Verify USDT BEP20 Deposit Transaction on BSC Blockchain
 */
async function verifyBscDeposit({ txHash, userId }) {
  if (!txHash || typeof txHash !== 'string') {
    return {
      success: false,
      code: 'INVALID_HASH_FORMAT',
      message: 'Transaction ID format is invalid.'
    };
  }

  let cleanHash = txHash.trim();
  // Strip BSCScan or explorer URL if user pasted the full link
  if (cleanHash.includes('/tx/')) {
    cleanHash = cleanHash.split('/tx/')[1].split(/[?#& ]/)[0];
  }
  cleanHash = cleanHash.replace(/['"<>]/g, '').trim();

  if (!cleanHash.startsWith('0x')) {
    cleanHash = '0x' + cleanHash;
  }

  if (cleanHash.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(cleanHash)) {
    return {
      success: false,
      code: 'INVALID_HASH_SYNTAX',
      message: 'Invalid Transaction ID length or character format. Please provide a valid 64-character TxID.'
    };
  }

  const normalizedHash = cleanHash.toLowerCase();

  // 1. DUPLICATE CHECK: A transaction ID cannot be used more than once!
  if (isTransactionAlreadyUsed(normalizedHash)) {
    return {
      success: false,
      code: 'ALREADY_USED',
      message: 'This Transaction ID has already been claimed and credited!'
    };
  }

  // 1b. Check PostgreSQL database directly (persists across restarts and container redeploys)
  try {
    const { pool } = require('./db');
    if (pool) {
      const dbCheck = await pool.query(
        'SELECT id FROM transactions WHERE LOWER(tx_hash) = $1 LIMIT 1',
        [normalizedHash]
      );
      if (dbCheck.rows && dbCheck.rows.length > 0) {
        markTransactionAsUsed(normalizedHash, { reused: true });
        return {
          success: false,
          code: 'ALREADY_USED',
          message: 'This Transaction ID has already been claimed and credited!'
        };
      }
    }
  } catch (dbErr) {
    console.warn('DB check in verifyBscDeposit notice:', dbErr.message);
  }

  // 2. QUERY BSC BLOCKCHAIN RECEIPT (With automatic retry polling for just-submitted transfers)
  let receipt = null;
  const maxReceiptAttempts = 4;
  for (let attempt = 1; attempt <= maxReceiptAttempts; attempt++) {
    try {
      receipt = await callBscRpc('eth_getTransactionReceipt', [cleanHash]);
      if (receipt) break;
    } catch (err) {
      console.warn(`[verifyBscDeposit] Receipt query attempt ${attempt} notice:`, err.message);
    }
    if (attempt < maxReceiptAttempts) {
      // Wait 2 seconds for block to be mined / propagated
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!receipt) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: 'Transaction not found on BSC blockchain yet. Please confirm your transfer is complete and try again.'
    };
  }

  // 3. CHECK TRANSACTION STATUS (0x1 = SUCCESS)
  if (receipt.status !== '0x1') {
    return {
      success: false,
      code: 'TX_FAILED',
      message: 'Transaction was reverted or failed on the BSC blockchain. Please try depositing again.'
    };
  }

  const logs = receipt.logs || [];
  const expectedRecipientTopic = '0x' + OFFICIAL_DEPOSIT_ADDRESS.replace('0x', '').padStart(64, '0').toLowerCase();

  let matchedUsdtTransfer = null;
  let wrongTokenFound = null;
  let wrongRecipientFound = null;

  for (const log of logs) {
    if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) continue;

    const emitterContract = log.address ? log.address.toLowerCase() : '';
    const recipientTopic = log.topics[2] ? log.topics[2].toLowerCase() : '';

    // Check if recipient matches our official deposit address
    const isRecipientMatch = recipientTopic === expectedRecipientTopic;
    // Check if token matches official USDT on BSC
    const isUsdtMatch = emitterContract === USDT_BEP20_CONTRACT;

    if (isRecipientMatch && isUsdtMatch) {
      matchedUsdtTransfer = log;
      break;
    } else if (isRecipientMatch && !isUsdtMatch) {
      wrongTokenFound = emitterContract;
    } else if (!isRecipientMatch && isUsdtMatch) {
      wrongRecipientFound = recipientTopic;
    }
  }

  // 4. VALIDATE TOKEN CONTRACT (Prevent fake tokens!)
  if (!matchedUsdtTransfer) {
    if (wrongTokenFound) {
      return {
        success: false,
        code: 'FAKE_OR_WRONG_TOKEN',
        message: 'Fake or unsupported token detected! You must pay with official USDT (BEP20).'
      };
    }

    if (wrongRecipientFound) {
      return {
        success: false,
        code: 'WRONG_RECIPIENT',
        message: 'Transaction recipient mismatch! Funds were not sent to our official deposit address.'
      };
    }

    return {
      success: false,
      code: 'NO_USDT_TRANSFER',
      message: 'No valid USDT (BEP20) transfer found in this transaction. Please try again.'
    };
  }

  // 5. PARSE & VALIDATE TRANSFER AMOUNT (USDT BEP20 has 18 decimals)
  let rawAmount = 0n;
  try {
    rawAmount = BigInt(matchedUsdtTransfer.data);
  } catch (err) {
    rawAmount = 0n;
  }

  // Convert from 18 decimals (wei) to decimal USDT
  const creditedAmount = Number(rawAmount) / 1e18;

  if (creditedAmount < MINIMUM_DEPOSIT_USDT) {
    return {
      success: false,
      code: 'BELOW_MINIMUM',
      message: `Deposit amount (${creditedAmount.toFixed(4)} USDT) is below the minimum required 3.00 USDT threshold!`
    };
  }

  // 6. RECORD AS USED (Prevents any replay / second credit)
  markTransactionAsUsed(normalizedHash, {
    userId: userId || 'unknown',
    amount: creditedAmount,
    token: 'USDT_BEP20',
    blockNumber: receipt.blockNumber,
    from: matchedUsdtTransfer.topics[1] ? '0x' + matchedUsdtTransfer.topics[1].slice(26) : 'unknown'
  });

  return {
    success: true,
    verified: true,
    amount: creditedAmount,
    txHash: cleanHash,
    blockNumber: parseInt(receipt.blockNumber, 16) || receipt.blockNumber,
    network: 'USDT (BEP20)',
    message: `Payment verified! ${creditedAmount.toFixed(2)} USDT has been credited to your wallet.`
  };
}

module.exports = {
  verifyBscDeposit,
  isTransactionAlreadyUsed,
  OFFICIAL_DEPOSIT_ADDRESS,
  USDT_BEP20_CONTRACT,
  MINIMUM_DEPOSIT_USDT
};
