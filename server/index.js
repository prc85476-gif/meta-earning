require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const { initTelegramBot } = require('./bot');
const { initAdminBot, notifyAdminNewWithdrawal, notifyAdminNewDeposit } = require('./adminBot');
const { verifyBscDeposit } = require('./bscVerification');
const {
  initDatabase,
  getOrCreateUser,
  getUserFullDetails,
  isAddressAlreadyRegistered,
  recordVerifiedDeposit,
  recordWithdrawalRequest,
  recordPlanPurchase,
  recordMiningClaim,
  getBotGlobalStats
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBAPP_URL = process.env.WEBAPP_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

// Available Deposit Mining Power Plans ($3, $5, $20, $50, $100, $200, $500)
const DEPOSIT_MINING_PLANS = [
  { id: 'bronze-3', name: 'Bronze Mining Plan', price: 3, dailyProfit: 0.12, hashrate: '10.0 GH/s' },
  { id: 'silver-5', name: 'Silver Mining Plan', price: 5, dailyProfit: 0.25, hashrate: '25.0 GH/s' },
  { id: 'gold-20', name: 'Gold Mining Plan', price: 20, dailyProfit: 1.10, hashrate: '110.0 GH/s' },
  { id: 'platinum-50', name: 'Platinum Power Plan', price: 50, dailyProfit: 3.00, hashrate: '300.0 GH/s' },
  { id: 'diamond-100', name: 'Diamond VIP Plan', price: 100, dailyProfit: 6.50, hashrate: '680.0 GH/s' },
  { id: 'titanium-200', name: 'Titanium Master Plan', price: 200, dailyProfit: 14.00, hashrate: '1,500 GH/s' },
  { id: 'quantum-500', name: 'Quantum Ultra Plan', price: 500, dailyProfit: 38.00, hashrate: '4,200 GH/s' }
];

app.get('/api/plans', (req, res) => {
  res.json({
    success: true,
    plans: DEPOSIT_MINING_PLANS
  });
});

// Dynamic QR code generation endpoint for official deposit address
app.get('/api/qr', async (req, res) => {
  try {
    const text = req.query.text || '0xf8e3Ea58EDB3719D934E1C2Bef4d160C1772FA81';
    const qrDataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.json({ success: true, qr: qrDataUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync User from Telegram WebApp
app.post('/api/user/sync', async (req, res) => {
  try {
    const { id, first_name, last_name, username, refCode } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    await getOrCreateUser({
      id,
      first_name,
      last_name,
      username,
      refCode
    });

    const userDetails = await getUserFullDetails(id);
    res.json({ success: true, user: userDetails });
  } catch (error) {
    console.error('API /api/user/sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get User Profile & Stats from Neon DB
app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    let user = await getUserFullDetails(userId);
    if (!user) {
      await getOrCreateUser({ id: userId, first_name: 'Miner' });
      user = await getUserFullDetails(userId);
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error('API /api/user/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process Daily Claim (Credits to Main Wallet Balance)
app.post('/api/claim', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid claim amount' });
    }

    const updatedUser = await recordMiningClaim({
      telegramId: userId || '987654321',
      amount: numAmt
    });

    res.json({
      success: true,
      walletBalance: Number(updatedUser.wallet_balance),
      user: updatedUser
    });
  } catch (error) {
    console.error('API /api/claim error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process BSC Blockchain Real Deposit Verification & Credit to Neon DB
app.post('/api/deposit/verify', async (req, res) => {
  const { userId, txHash } = req.body;

  if (!txHash) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_TX_HASH',
      message: 'Transaction ID is required. (দয়া করে Transaction ID দিন)'
    });
  }

  try {
    const actualUserId = (userId || '987654321').toString();

    // 1. Verify on BSC Blockchain
    const result = await verifyBscDeposit({
      txHash,
      userId: actualUserId
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // 2. Ensure user exists in Neon DB
    await getOrCreateUser({ id: actualUserId });

    // 3. Record in Neon DB (Credits Deposit Balance & 10% Referrer commission)
    const updatedUser = await recordVerifiedDeposit({
      telegramId: actualUserId,
      amount: result.amount,
      txHash: result.txHash,
      network: 'BEP20 (BSC)'
    });

    // Send Instant Push Alert to Admin Bot (@alhajbf2)
    notifyAdminNewDeposit({
      txHash: result.txHash,
      telegramId: actualUserId,
      username: updatedUser.username,
      firstName: updatedUser.first_name,
      lastName: updatedUser.last_name,
      amount: result.amount,
      depositBalance: updatedUser.deposit_balance,
      totalDeposit: updatedUser.total_deposit,
      referredBy: updatedUser.referred_by,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    res.json({
      success: true,
      verified: true,
      amount: result.amount,
      totalDeposit: Number(updatedUser.total_deposit),
      depositBalance: Number(updatedUser.deposit_balance),
      walletBalance: Number(updatedUser.wallet_balance),
      txHash: result.txHash,
      message: result.message
    });
  } catch (error) {
    console.error('Verification endpoint error:', error);
    res.status(400).json({
      success: false,
      code: 'VERIFY_ERROR',
      message: error.message || 'Verification system error. Please try again.'
    });
  }
});

// Process Withdraw (Deducts Main Balance, locks Address, Pending Status)
app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, address, network } = req.body;
    const actualUserId = (userId || '987654321').toString();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount < 5.0) {
      return res.status(400).json({
        success: false,
        message: 'সর্বনিম্ন উইথড্র ৫.০০ USDT! (Minimum withdrawal is 5.00 USDT)'
      });
    }

    if (!address || !address.startsWith('0x') || address.length < 38) {
      return res.status(400).json({
        success: false,
        message: 'দয়া করে সঠিক BEP20 ওয়ালেট অ্যাড্রেস দিন!'
      });
    }

    // Check duplicate address across accounts ("ar ak addres 2 ta jaigai use korte parbe na")
    const isUsedElsewhere = await isAddressAlreadyRegistered(address, actualUserId);
    if (isUsedElsewhere) {
      return res.status(400).json({
        success: false,
        message: 'এই অ্যাড্রেসটি ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহার করা হয়েছে! একই অ্যাড্রেস একাধিক অ্যাকাউন্টে ব্যবহার নিষিদ্ধ।'
      });
    }

    await getOrCreateUser({ id: actualUserId });

    const { user, transaction } = await recordWithdrawalRequest({
      telegramId: actualUserId,
      amount: numAmount,
      address,
      network: network || 'BEP20'
    });

    // Send Instant Push Alert to Admin Bot with Approve & Reject buttons
    notifyAdminNewWithdrawal({
      id: transaction.id,
      telegramId: actualUserId,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      amount: numAmount,
      address,
      walletBalance: user.wallet_balance,
      depositBalance: user.deposit_balance,
      totalReferrals: user.total_referrals,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    res.json({
      success: true,
      status: 'Pending',
      message: 'উইথড্র রিকোয়েস্ট সফলভাবে জমা হয়েছে এবং হিস্টোরিতে পেন্ডিং রয়েছে।',
      walletBalance: Number(user.wallet_balance),
      totalWithdraw: Number(user.total_withdraw),
      transaction
    });
  } catch (error) {
    console.error('API /api/withdraw error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'উইথড্র প্রক্রিয়াকরণে সমস্যা হয়েছে।'
    });
  }
});

// Buy Power Plan with Deposit Balance
app.post('/api/plans/buy', async (req, res) => {
  try {
    const { userId, planId } = req.body;
    const actualUserId = (userId || '987654321').toString();

    const plan = DEPOSIT_MINING_PLANS.find(p => p.id === planId);
    if (!plan) {
      return res.status(400).json({ success: false, message: 'প্ল্যানটি খুঁজে পাওয়া যায়নি।' });
    }

    await getOrCreateUser({ id: actualUserId });

    const updatedUser = await recordPlanPurchase({
      telegramId: actualUserId,
      planId: plan.id,
      planName: plan.name,
      planPrice: plan.price,
      dailyProfit: plan.dailyProfit,
      hashrateBonus: parseFloat(plan.hashrate) || 1.0
    });

    res.json({
      success: true,
      message: `${plan.name} সফলভাবে কেনা হয়েছে!`,
      user: updatedUser
    });
  } catch (error) {
    console.error('API /api/plans/buy error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'প্ল্যান কেনার সময় সমস্যা হয়েছে।'
    });
  }
});

// Bot Global Statistics API
app.get('/api/stats/global', async (req, res) => {
  try {
    const stats = await getBotGlobalStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('API /api/stats/global error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend static assets
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Fallback to React index.html for any /path or custom SPA route (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Initialize Neon DB and Start Express Server
async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`⚡ USDT Power Plan Server running on port ${PORT}`);
      console.log(`🔗 Local URL: http://localhost:${PORT}`);
      console.log(`🌐 WebApp URL: ${WEBAPP_URL}`);
      console.log(`🐘 Neon PostgreSQL Connected & Ready!`);
      console.log(`====================================================`);

      // Initialize Telegram User Bot
      initTelegramBot(WEBAPP_URL);

      // Initialize Telegram Admin Bot (@alhajbf2)
      initAdminBot();
    });
  } catch (err) {
    console.error('Fatal Server Startup Error:', err);
    process.exit(1);
  }
}

startServer();
