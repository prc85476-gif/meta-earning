const { ethers } = require('ethers');

// Official BSC Configuration
const USDT_BEP20_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
const BSC_RPC_ENDPOINTS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc.publicnode.com'
];

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// Clean private key string from env
function getCleanPrivateKey() {
  const raw = process.env.HOT_WALLET_PRIVATE_KEY || '';
  if (!raw) return null;
  let cleaned = raw.replace(/\s+/g, '').trim();
  if (!cleaned.startsWith('0x')) {
    cleaned = '0x' + cleaned;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Get an active BSC JsonRpcProvider with failover support
 */
async function getActiveProvider() {
  for (const rpcUrl of BSC_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, {
        chainId: 56,
        name: 'binance'
      });
      // Quick ping test
      await provider.getBlockNumber();
      return provider;
    } catch (err) {
      // Try next RPC
    }
  }
  // Fallback to default
  return new ethers.JsonRpcProvider(BSC_RPC_ENDPOINTS[0]);
}

/**
 * Get the Hot Wallet signer instance
 */
async function getHotWalletSigner() {
  const privateKey = getCleanPrivateKey();
  if (!privateKey) {
    throw new Error('HOT_WALLET_PRIVATE_KEY is not configured or invalid in .env!');
  }
  const provider = await getActiveProvider();
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get the public address of the Hot Wallet
 */
function getHotWalletAddress() {
  try {
    const key = getCleanPrivateKey();
    if (!key) return null;
    const wallet = new ethers.Wallet(key);
    return wallet.address;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch live on-chain balances for the Hot Wallet (BNB & USDT BEP20)
 */
async function getHotWalletBalances() {
  const address = getHotWalletAddress();
  if (!address) {
    return {
      configured: false,
      address: null,
      bnbBalance: '0.0000',
      usdtBalance: '0.00',
      error: 'HOT_WALLET_PRIVATE_KEY is not configured.'
    };
  }

  try {
    const provider = await getActiveProvider();
    
    // Fetch BNB balance (gas)
    const bnbRaw = await provider.getBalance(address);
    const bnbBalance = ethers.formatEther(bnbRaw);

    // Fetch USDT BEP20 balance
    const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, provider);
    const usdtRaw = await usdtContract.balanceOf(address);
    const usdtBalance = ethers.formatUnits(usdtRaw, 18);

    return {
      configured: true,
      address,
      bnbBalance: parseFloat(bnbBalance).toFixed(6),
      usdtBalance: parseFloat(usdtBalance).toFixed(2),
      isLowBnb: parseFloat(bnbBalance) < 0.001,
      isLowUsdt: parseFloat(usdtBalance) < 5.0
    };
  } catch (err) {
    console.error('Error fetching hot wallet balances:', err.message);
    return {
      configured: true,
      address,
      bnbBalance: 'Error',
      usdtBalance: 'Error',
      error: err.message
    };
  }
}

/**
 * Send USDT (BEP20) Payout from Hot Wallet to Destination User Address
 * @param {Object} params
 * @param {string} params.toAddress - BEP20 address of recipient
 * @param {number|string} params.amount - Amount of USDT to send
 * @returns {Promise<{ success: boolean, txHash: string, blockNumber: number, amount: number, toAddress: string }>}
 */
async function sendUsdtPayout({ toAddress, amount }) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error(`Invalid payout amount: ${amount} USDT`);
  }

  if (!toAddress || !ethers.isAddress(toAddress)) {
    throw new Error(`Invalid destination BEP20 address: ${toAddress}`);
  }

  // 1. Get signer & provider
  const signer = await getHotWalletSigner();
  const provider = signer.provider;
  const hotWalletAddress = signer.address;

  // 2. Check Gas (BNB) Balance
  const bnbRaw = await provider.getBalance(hotWalletAddress);
  const bnbBalance = parseFloat(ethers.formatEther(bnbRaw));
  // A BSC transfer usually needs ~0.0003 BNB for gas
  if (bnbBalance < 0.0003) {
    throw new Error(`Insufficient BNB in Hot Wallet for gas fees! (Balance: ${bnbBalance.toFixed(6)} BNB). Please deposit at least 0.005 BNB to ${hotWalletAddress}`);
  }

  // 3. Check USDT (BEP20) Balance
  const usdtContract = new ethers.Contract(USDT_BEP20_CONTRACT, ERC20_ABI, signer);
  const usdtRaw = await usdtContract.balanceOf(hotWalletAddress);
  const currentUsdt = parseFloat(ethers.formatUnits(usdtRaw, 18));

  if (currentUsdt < numericAmount) {
    throw new Error(`Insufficient USDT in Hot Wallet! (Current: $${currentUsdt.toFixed(2)} USDT, Required: $${numericAmount.toFixed(2)} USDT). Please deposit USDT to ${hotWalletAddress}`);
  }

  // 4. Format amount to 18 decimals wei
  // Format to 4 decimal places to prevent floating point imprecision
  const fixedAmountStr = numericAmount.toFixed(4);
  const parsedAmount = ethers.parseUnits(fixedAmountStr, 18);

  console.log(`[HotWallet] Initiating on-chain payout: ${fixedAmountStr} USDT to ${toAddress}...`);

  // 5. Send transaction with failover retry if RPC drops
  let tx;
  try {
    // Estimate gas or provide safe gas limit
    const estimatedGas = await usdtContract.transfer.estimateGas(toAddress, parsedAmount).catch(() => 100000n);
    const gasLimit = (estimatedGas * 120n) / 100n; // 20% buffer

    tx = await usdtContract.transfer(toAddress, parsedAmount, {
      gasLimit
    });
    console.log(`[HotWallet] Transaction broadcasted! TxHash: ${tx.hash}`);
  } catch (broadcastErr) {
    console.error('[HotWallet] Transfer broadcast error:', broadcastErr.message);
    throw new Error(`Blockchain broadcast failed: ${broadcastErr.message}`);
  }

  // 6. Wait for 1 confirmation
  console.log(`[HotWallet] Waiting for confirmation on BSC blockchain...`);
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error(`Transaction reverted on BSC blockchain! TxHash: ${tx.hash}`);
  }

  console.log(`[HotWallet] Payout successfully confirmed in block ${receipt.blockNumber}! TxHash: ${tx.hash}`);

  return {
    success: true,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    amount: numericAmount,
    toAddress,
    fromAddress: hotWalletAddress
  };
}

module.exports = {
  getHotWalletAddress,
  getHotWalletBalances,
  sendUsdtPayout,
  USDT_BEP20_CONTRACT
};
