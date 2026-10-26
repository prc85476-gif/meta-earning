const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const {
  getUserFullDetails,
  getBotGlobalStats,
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
  pool
} = require('./db');
const { sendNotificationToUser, sendPhotoToUser, notifyUserWithdrawalApproved } = require('./bot');
const {
  getHotWalletAddress,
  getHotWalletBalances,
  sendUsdtPayout,
  USDT_BEP20_CONTRACT
} = require('./hotWallet');

// Standard Deposit Mining Plans
const DEPOSIT_MINING_PLANS = [
  { id: 'bronze-3', name: 'Bronze Mining Plan', price: 3, dailyProfit: 0.12, hashrate: 10.0, hashrateDisplay: '10.0 GH/s' },
  { id: 'silver-5', name: 'Silver Mining Plan', price: 5, dailyProfit: 0.25, hashrate: 25.0, hashrateDisplay: '25.0 GH/s' },
  { id: 'gold-20', name: 'Gold Mining Plan', price: 20, dailyProfit: 1.10, hashrate: 110.0, hashrateDisplay: '110.0 GH/s' },
  { id: 'platinum-50', name: 'Platinum Power Plan', price: 50, dailyProfit: 3.00, hashrate: 300.0, hashrateDisplay: '300.0 GH/s' },
  { id: 'diamond-100', name: 'Diamond VIP Plan', price: 100, dailyProfit: 6.50, hashrate: 680.0, hashrateDisplay: '680.0 GH/s' },
  { id: 'titanium-200', name: 'Titanium Master Plan', price: 200, dailyProfit: 14.00, hashrate: 1500.0, hashrateDisplay: '1,500 GH/s' },
  { id: 'quantum-500', name: 'Quantum Ultra Plan', price: 500, dailyProfit: 38.00, hashrate: 4200.0, hashrateDisplay: '4,200 GH/s' }
];

const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_STATE_FILE = path.join(DATA_DIR, 'admin_settings.json');

function loadAdminChatId() {
  try {
    if (fs.existsSync(ADMIN_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_STATE_FILE, 'utf8') || '{}');
      return data.savedAdminChatId || null;
    }
  } catch (e) {}
  return null;
}

function saveAdminChatId(id) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    let data = {};
    if (fs.existsSync(ADMIN_STATE_FILE)) {
      data = JSON.parse(fs.readFileSync(ADMIN_STATE_FILE, 'utf8') || '{}');
    }
    data.savedAdminChatId = id;
    fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

let adminBotInstance = null;
let savedAdminChatId = loadAdminChatId();
const adminState = {}; // Tracks interactive input state for admin chat (e.g. broadcast, search)

const AUTHORIZED_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'alhajbf2').toLowerCase().replace('@', '');

function initAdminBot() {
  const token = process.env.ADMIN_BOT_TOKEN;

  if (!token) {
    console.log('ℹ️  ADMIN_BOT_TOKEN is not configured in .env');
    return null;
  }

  try {
    const bot = new TelegramBot(token, { polling: true });
    adminBotInstance = bot;
    console.log('🛡️  Admin Bot is running in polling mode...');

    bot.getMe().then(me => {
      console.log(`🤖 Admin Bot @${me.username} connected. Authorized Admin: @${AUTHORIZED_ADMIN_USERNAME}`);
    }).catch(err => console.error('Admin bot info error:', err.message));

    // Security check middleware
    const isAuthorizedAdmin = (from) => {
      if (!from) return false;
      const username = (from.username || '').toLowerCase().replace('@', '');
      return username === AUTHORIZED_ADMIN_USERNAME;
    };

    // Helper: Build Main Admin Dashboard
    const sendAdminDashboard = async (chatId, messageId = null) => {
      try {
        const stats = await getBotGlobalStats();
        const pendingList = await getPendingWithdrawals();
        const hotBal = await getHotWalletBalances();

        const text = 
`👑 *META FARM ADMIN CONTROL PANEL* 👑\n` +
`👤 *Authorized Admin:* @${AUTHORIZED_ADMIN_USERNAME}\n` +
`────────────────────────\n\n` +
`📊 *Live System Overview (Neon PostgreSQL):*\n` +
`• 👥 *Total Registered Miners:* \`${stats.total_users || 0}\`\n` +
`• 💰 *Users Main Wallet Balances:* \`$${Number(stats.total_user_wallet_balance || 0).toFixed(2)} USDT\`\n` +
`• 📥 *Users Active Deposit Balances:* \`$${Number(stats.total_user_deposit_balance || 0).toFixed(2)} USDT\`\n` +
`• 💳 *Total Verified Deposits:* \`$${Number(stats.total_bot_deposit || 0).toFixed(2)} USDT\`\n` +
`• 💸 *Total Completed Withdrawals:* \`$${Number(stats.total_bot_withdraw || 0).toFixed(2)} USDT\`\n` +
`• ⏳ *Pending Withdrawals Queue:* \`${pendingList.length} request(s)\`\n` +
`• 🎁 *Total Referral Commissions Distributed:* \`$${Number(stats.total_referral_commissions || 0).toFixed(2)} USDT\`\n` +
`• 📝 *Total Platform Transactions:* \`${stats.total_transactions || 0}\`\n\n` +
`🔥 *Hot Wallet (BSC BEP20 Auto-Payout):*\n` +
`• 📍 *Address:* \`${hotBal.address ? hotBal.address.slice(0, 6) + '...' + hotBal.address.slice(-4) : 'Not configured'}\`\n` +
`• 💵 *USDT Balance:* \`$${hotBal.usdtBalance} USDT\`\n` +
`• ⛽ *BNB Gas Balance:* \`${hotBal.bnbBalance} BNB\` ${hotBal.isLowBnb ? '⚠️ (Low Gas!)' : '🟢'}\n\n` +
`Select an action below to manage the platform:`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: `⏳ Pending Withdrawals (${pendingList.length})`, callback_data: 'admin_pending_wd' },
              { text: `🔥 Hot Wallet ($${hotBal.usdtBalance})`, callback_data: 'admin_hot_wallet' }
            ],
            [
              { text: `📥 Recent Deposits`, callback_data: 'admin_recent_dp' },
              { text: `💼 Financial Overview`, callback_data: 'admin_system_finance' }
            ],
            [
              { text: `🔍 Search User`, callback_data: 'admin_search_prompt' },
              { text: `📢 Broadcast Message`, callback_data: 'admin_broadcast_prompt' }
            ],
            [
              { text: `👥 Recent Users (10)`, callback_data: 'admin_users_list' },
              { text: `🏆 Top Referrers`, callback_data: 'admin_top_referrers' }
            ],
            [
              { text: `💎 Top Investors`, callback_data: 'admin_top_investors' },
              { text: `🔄 Refresh Dashboard`, callback_data: 'admin_refresh' }
            ]
          ]
        };

        if (messageId) {
          await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }).catch(async () => {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
          });
        } else {
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
        }
      } catch (err) {
        console.error('Error sending admin dashboard:', err);
        bot.sendMessage(chatId, '❌ Error loading admin dashboard: ' + err.message);
      }
    };

    // Helper: Build Hot Wallet Card
    const sendHotWalletCard = async (chatId, messageId = null) => {
      try {
        const hotBal = await getHotWalletBalances();
        const pending = await getPendingWithdrawals();
        const pendingWdAmount = pending.reduce((acc, curr) => acc + Math.max(0, Number(curr.amount || 0) - 1.0), 0);

        const text =
`🔥 *BSC HOT WALLET CONTROL & MONITOR* 🔥\n` +
`────────────────────────\n` +
`• 📍 *Hot Wallet Address:*\n\`${hotBal.address || 'Not Configured'}\`\n\n` +
`💰 *Live Blockchain Balances:*\n` +
`• 💵 *USDT (BEP20):* \`$${hotBal.usdtBalance} USDT\`\n` +
`• ⛽ *BNB (Gas Fees):* \`${hotBal.bnbBalance} BNB\`\n` +
`• 🌐 *Network:* BNB Smart Chain (ChainId 56)\n` +
`• 📦 *Token Contract:*\n\`${USDT_BEP20_CONTRACT}\`\n\n` +
`⏳ *Pending Payout Obligations:* \`$${pendingWdAmount.toFixed(2)} USDT\` (${pending.length} pending tx)\n` +
`• 🟢 *Status:* ${hotBal.configured ? (hotBal.isLowBnb ? '⚠️ Low BNB for Gas' : '✅ Active & Ready for Auto-Payouts') : '❌ Private Key Missing'}\n\n` +
`💡 *Payout Workflow:*\n` +
`When a user submits a withdrawal, it appears under *Pending Withdrawals*. When you click *⚡ Approve & Auto-Payout*, the hot wallet signs the BEP20 transfer, submits it directly to BSC, and sends the user the verified BscScan link!`;

        const buttons = {
          inline_keyboard: [
            [
              { text: '🔄 Refresh Balances', callback_data: 'admin_hot_wallet' },
              { text: '🔍 View on BSCscan', url: `https://bscscan.com/address/${hotBal.address}` }
            ],
            [
              { text: `⏳ Pending Withdrawals (${pending.length})`, callback_data: 'admin_pending_wd' },
              { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
            ]
          ]
        };

        if (messageId) {
          await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: buttons
          }).catch(async () => {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buttons });
          });
        } else {
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buttons });
        }
      } catch (err) {
        console.error('Error fetching hot wallet details:', err);
        bot.sendMessage(chatId, '❌ Error fetching hot wallet details: ' + err.message);
      }
    };

    // Helper: Build standard user profile action buttons
    const getUserActionButtons = (targetId) => ({
      inline_keyboard: [
        [
          { text: '🎁 Gift Mining Plan', callback_data: `gift_plan_${targetId}` },
          { text: '🔓 Reset BEP20 Addr', callback_data: `reset_addr_${targetId}` }
        ],
        [
          { text: '💰 Add Deposit Bal', callback_data: `add_dep_prompt_${targetId}` },
          { text: '💵 Add Wallet Bal', callback_data: `add_wal_prompt_${targetId}` }
        ],
        [
          { text: '📜 Transaction History', callback_data: `user_tx_${targetId}` },
          { text: '🔍 New Search', callback_data: 'admin_search_prompt' }
        ],
        [
          { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
        ]
      ]
    });

    // Helper: Render User Profile Card in English with full plan details
    const renderUserProfile = (target) => {
      const plansList = Array.isArray(target.purchased_plans) ? target.purchased_plans : [];
      let plansDisplay = '• Default Free Starter (0.0100 USDT/d)';
      if (plansList.length > 0) {
        plansDisplay = plansList.map(pid => {
          const found = DEPOSIT_MINING_PLANS.find(p => p.id === pid);
          return found ? `• ${found.name} ($${found.price} | +${found.dailyProfit}/d)` : `• ${pid}`;
        }).join('\n');
      }

      return (
`👤 *USER PROFILE & MINING DETAILS* 👤\n` +
`────────────────────────\n` +
`• 👤 *Full Name:* ${target.first_name || ''} ${target.last_name || ''}\n` +
`• 📱 *Username:* @${target.username || 'N/A'}\n` +
`• 🆔 *Telegram ID:* \`${target.telegram_id}\`\n\n` +
`💰 *Account Balances:*\n` +
`• 💵 *Withdrawable Balance:* \`$${Number(target.wallet_balance).toFixed(4)} USDT\`\n` +
`• 📥 *Deposit Balance:* \`$${Number(target.deposit_balance).toFixed(2)} USDT\`\n` +
`• 💳 *Total Deposited All-Time:* \`$${Number(target.total_deposit).toFixed(2)} USDT\`\n` +
`• 💸 *Total Withdrawn All-Time:* \`$${Number(target.total_withdraw).toFixed(2)} USDT\`\n\n` +
`⚡ *Mining Power & Active Plans:*\n` +
`• ⚡ *Daily Mining Rate:* \`${Number(target.daily_mining_rate).toFixed(4)} USDT/day\`\n` +
`• 🚀 *Current Hashrate:* \`${Number(target.hashrate).toFixed(2)} GH/s\`\n` +
`• 📦 *Active Plans (${plansList.length}):*\n${plansDisplay}\n\n` +
`🔒 *Locked BEP20 Address:*\n` +
`\`${target.withdraw_address || 'Not Set / Locked Yet'}\`\n\n` +
`👥 *Referral Statistics:*\n` +
`• 👥 *Total Referrals:* \`${target.total_referrals || 0}\`\n` +
`• 🎁 *Referral Bonus Earned:* \`$${Number(target.total_referral_bonus).toFixed(2)} USDT\`\n` +
`• 🔗 *Invited By:* \`${target.referred_by || 'Direct / None'}\`\n` +
`📅 *Registered:* ${new Date(target.created_at).toLocaleString()}`
      );
    };

    // /start command
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const from = msg.from;

      if (!isAuthorizedAdmin(from)) {
        return bot.sendMessage(chatId, '⛔ *Access Denied!*\n\nYou are not authorized to access this Meta Farm Admin Panel.', {
          parse_mode: 'Markdown'
        });
      }

      savedAdminChatId = chatId;
      saveAdminChatId(chatId);
      delete adminState[chatId];
      await sendAdminDashboard(chatId);
    });

    // /wallet or /hotwallet command
    bot.onText(/\/(wallet|hotwallet)/, async (msg) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      savedAdminChatId = chatId;
      saveAdminChatId(chatId);
      await sendHotWalletCard(chatId);
    });

    // /help command
    bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      savedAdminChatId = chatId;
      saveAdminChatId(chatId);

      const helpText =
`🛠 *Admin Command Quick Reference* 🛠\n\n` +
`• \`/start\` - Open Admin Control Dashboard\n` +
`• \`/wallet\` - View Hot Wallet (USDT & BNB Gas balances)\n` +
`• \`/search <username|id>\` - Search and view any user account\n` +
`• \`/broadcast <message>\` - Broadcast an announcement to all miners\n` +
`• \`/adjust <id> <amount> [wallet|deposit]\` - Credit or debit user balance\n` +
`• \`/cancel\` - Cancel current search or broadcast prompt`;

      bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    // /cancel command
    bot.onText(/\/cancel/, async (msg) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      delete adminState[chatId];
      bot.sendMessage(chatId, '🚫 Action cancelled. Returning to dashboard.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
        }
      });
    });

    // /search or /find command
    bot.onText(/\/(search|find)(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      savedAdminChatId = chatId;
      saveAdminChatId(chatId);

      const query = (match[2] || '').trim();
      if (!query) {
        adminState[chatId] = { step: 'awaiting_search' };
        return bot.sendMessage(chatId, '🔍 *Search User Account*\n\nPlease send the Telegram Username (e.g. `@johndoe`) or numeric Telegram ID:', {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
          }
        });
      }

      try {
        const results = await searchUser(query);
        if (results.length === 0) {
          return bot.sendMessage(chatId, `❌ No user found matching: \`${query}\``, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        }

        for (const user of results) {
          const profile = renderUserProfile(user);
          await bot.sendMessage(chatId, profile, {
            parse_mode: 'Markdown',
            reply_markup: getUserActionButtons(user.telegram_id)
          });
        }
      } catch (err) {
        bot.sendMessage(chatId, '❌ Search failed: ' + err.message);
      }
    });

    // /broadcast command
    bot.onText(/\/broadcast(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      savedAdminChatId = chatId;
      saveAdminChatId(chatId);

      const directText = (match[1] || '').trim();
      if (directText) {
        adminState[chatId] = {
          step: 'awaiting_broadcast_btn_choice',
          broadcastData: {
            text: directText,
            photo: null,
            button: null
          }
        };
        return bot.sendMessage(chatId,
`🔗 *STEP 2 OF 3: ATTACH INLINE LINK / BUTTON* 🔗\n` +
`────────────────────────\n` +
`Text captured! Do you want to attach a clickable button with a link (e.g. Channel or Promotion)?`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Add Button & Link', callback_data: 'bc_add_btn' },
                { text: '⏭️ Skip (No Button)', callback_data: 'bc_skip_btn' }
              ],
              [
                { text: '🚫 Cancel Broadcast', callback_data: 'admin_refresh' }
              ]
            ]
          }
        });
      }

      await startBroadcastFlow(chatId);
    });

    // /adjust command (e.g. `/adjust 123456789 5.00` or `/adjust 123456789 -2.50 deposit`)
    bot.onText(/\/adjust\s+(\S+)\s+(\S+)(?:\s+(\S+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      savedAdminChatId = chatId;
      saveAdminChatId(chatId);

      const targetId = match[1];
      const amount = parseFloat(match[2]);
      const type = (match[3] || 'wallet').toLowerCase().includes('deposit') ? 'deposit_balance' : 'wallet_balance';

      if (isNaN(amount)) {
        return bot.sendMessage(chatId, '❌ Invalid amount. Usage: `/adjust <telegramId> <amount> [wallet|deposit]`', { parse_mode: 'Markdown' });
      }

      try {
        const updated = await adjustUserBalance(targetId, amount, type);
        if (!updated) {
          return bot.sendMessage(chatId, `❌ User with ID \`${targetId}\` not found in database.`, { parse_mode: 'Markdown' });
        }

        const typeName = type === 'deposit_balance' ? 'Deposit Balance' : 'Withdrawable Balance';
        const msgText = 
`✅ *Balance Adjusted Successfully!*\n\n` +
`• User: ${updated.first_name || ''} (@${updated.username || 'N/A'})\n` +
`• Target ID: \`${targetId}\`\n` +
`• Balance Type: ${typeName}\n` +
`• Adjustment: \`${amount >= 0 ? '+' : ''}${amount.toFixed(2)} USDT\`\n` +
`• New ${typeName}: \`$${Number(updated[type]).toFixed(4)} USDT\``;

        bot.sendMessage(chatId, msgText, {
          parse_mode: 'Markdown',
          reply_markup: getUserActionButtons(targetId)
        });
      } catch (err) {
        bot.sendMessage(chatId, '❌ Error adjusting balance: ' + err.message);
      }
    });

    // Helper: Start Step 1 of Broadcast Flow
    const startBroadcastFlow = async (chatId) => {
      adminState[chatId] = {
        step: 'awaiting_broadcast_content',
        broadcastData: {
          text: '',
          photo: null,
          button: null
        }
      };

      const promptText = 
`📢 *STEP 1 OF 3: COMPOSE BROADCAST CONTENT* 📢\n` +
`────────────────────────\n` +
`Please send the announcement content:\n\n` +
`• ✍️ You can send a *Text Message* (supports Markdown)\n` +
`• 🖼️ OR you can send a *Photo with Caption*!\n\n` +
`_Type /cancel at any time to abort._`;

      await bot.sendMessage(chatId, promptText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🚫 Cancel Broadcast', callback_data: 'admin_refresh' }]]
        }
      });
    };

    // Helper: Show Broadcast Preview (Step 3)
    const showBroadcastPreview = async (chatId, broadcastData) => {
      try {
        await bot.sendMessage(chatId,
`👁️ *STEP 3 OF 3: BROADCAST PREVIEW* 👁️\n` +
`────────────────────────\n` +
`_Below is the exact preview of how miners will see your broadcast:_`, {
          parse_mode: 'Markdown'
        });

        const buttonMarkup = broadcastData.button ? {
          inline_keyboard: [[{ text: broadcastData.button.text, url: broadcastData.button.url }]]
        } : undefined;

        if (broadcastData.photo) {
          await bot.sendPhoto(chatId, broadcastData.photo, {
            caption: broadcastData.text || '',
            parse_mode: 'Markdown',
            reply_markup: buttonMarkup
          }).catch(async () => {
            await bot.sendPhoto(chatId, broadcastData.photo, {
              caption: broadcastData.text || '',
              reply_markup: buttonMarkup
            });
          });
        } else {
          await bot.sendMessage(chatId, broadcastData.text || '📢 Announcement', {
            parse_mode: 'Markdown',
            reply_markup: buttonMarkup
          }).catch(async () => {
            await bot.sendMessage(chatId, broadcastData.text || '📢 Announcement', {
              reply_markup: buttonMarkup
            });
          });
        }

        const confirmMsg =
`⚠️ *CONFIRM & LAUNCH BROADCAST* ⚠️\n` +
`────────────────────────\n` +
`• 📦 *Format:* ${broadcastData.photo ? '🖼️ Photo + Caption' : '✍️ Text Message'}\n` +
`• 🔗 *Button:* ${broadcastData.button ? `[${broadcastData.button.text}] (${broadcastData.button.url})` : 'No Button'}\n\n` +
`Ready to send in real-time to all miners?`;

        await bot.sendMessage(chatId, confirmMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🚀 Launch Broadcast Now', callback_data: 'bc_launch' }
              ],
              [
                { text: '✏️ Restart / Edit', callback_data: 'admin_broadcast_prompt' },
                { text: '🚫 Cancel', callback_data: 'admin_refresh' }
              ]
            ]
          }
        });
      } catch (err) {
        bot.sendMessage(chatId, '❌ Error showing preview: ' + err.message);
      }
    };

    // Helper: Execute Rich Broadcast with Real-Time Progress Bar
    const executeRichBroadcast = async (chatId, broadcastData) => {
      try {
        const userIds = await getAllUserTelegramIds();
        if (userIds.length === 0) {
          return bot.sendMessage(chatId, '⚠️ No registered miners found in database to broadcast.');
        }

        const totalUsers = userIds.length;
        const statusMsg = await bot.sendMessage(chatId,
`🚀 *BROADCAST LAUNCHED IN REAL-TIME...*
[░░░░░░░░░░] 0% (0/${totalUsers})
• ✅ Delivered: 0
• ⚠️ Failed/Blocked: 0
• ⏳ Status: Sending...`, { parse_mode: 'Markdown' });

        let success = 0;
        let failed = 0;
        let lastEditTime = Date.now();

        const buttonMarkup = broadcastData.button ? {
          inline_keyboard: [[{ text: broadcastData.button.text, url: broadcastData.button.url }]]
        } : undefined;

        for (let i = 0; i < totalUsers; i++) {
          const uid = userIds[i];
          try {
            if (broadcastData.photo) {
              await sendPhotoToUser(uid, broadcastData.photo, broadcastData.text, {
                reply_markup: buttonMarkup
              });
            } else {
              await sendNotificationToUser(uid, broadcastData.text, {
                reply_markup: buttonMarkup
              });
            }
            success++;
          } catch (e) {
            failed++;
          }

          const now = Date.now();
          const isLast = i === totalUsers - 1;
          if (now - lastEditTime > 2000 || isLast) {
            lastEditTime = now;
            const current = i + 1;
            const percent = Math.floor((current / totalUsers) * 100);
            const filled = Math.min(10, Math.floor(percent / 10));
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

            await bot.editMessageText(
`🚀 *BROADCAST IN PROGRESS (REAL-TIME)* 🚀\n` +
`[${bar}] ${percent}% (${current}/${totalUsers})\n` +
`• ✅ Delivered: \`${success}\`\n` +
`• ⚠️ Failed/Blocked: \`${failed}\`\n` +
`• 👥 Total Miners: \`${totalUsers}\``, {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }).catch(() => {});
          }

          // Delay to respect Telegram API rate limits
          await new Promise(r => setTimeout(r, 40));
        }

        const finalReport =
`📢 *BROADCAST COMPLETED SUCCESSFULLY!* 📢\n` +
`────────────────────────\n` +
`• 👥 *Total Miners Targeted:* \`${totalUsers}\`\n` +
`• ✅ *Successfully Delivered:* \`${success}\`\n` +
`• ⚠️ *Failed / Blocked:* \`${failed}\`\n` +
`• 📦 *Format:* ${broadcastData.photo ? '🖼️ Photo + Caption' : '✍️ Text Message'}${broadcastData.button ? ' + 🔗 Link Button' : ''}\n` +
`• ⏱️ *Completed At:* ${new Date().toLocaleTimeString()}`;

        await bot.editMessageText(finalReport, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
          }
        }).catch(async () => {
          await bot.sendMessage(chatId, finalReport, { parse_mode: 'Markdown' });
        });

      } catch (err) {
        console.error('Error executing rich broadcast:', err);
        bot.sendMessage(chatId, '❌ Broadcast execution error: ' + err.message);
      }
    };

    // Interactive message listener for search, broadcast & balance prompts
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      if (msg.text && msg.text.startsWith('/')) return; // Ignore slash commands

      const state = adminState[chatId];
      if (!state) return;

      // 1. Search Query Input
      if (state.step === 'awaiting_search' || state === 'awaiting_search') {
        delete adminState[chatId];
        const query = (msg.text || '').trim();
        try {
          const results = await searchUser(query);
          if (results.length === 0) {
            return bot.sendMessage(chatId, `❌ No user found matching: \`${query}\``, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔍 Search Again', callback_data: 'admin_search_prompt' }],
                  [{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]
                ]
              }
            });
          }

          for (const user of results) {
            const profile = renderUserProfile(user);
            await bot.sendMessage(chatId, profile, {
              parse_mode: 'Markdown',
              reply_markup: getUserActionButtons(user.telegram_id)
            });
          }
        } catch (err) {
          bot.sendMessage(chatId, '❌ Search error: ' + err.message);
        }
        return;
      }

      // 2. Broadcast Step 1: Content Input (Photo or Text)
      if (state.step === 'awaiting_broadcast_content') {
        if (msg.photo && msg.photo.length > 0) {
          state.broadcastData.photo = msg.photo[msg.photo.length - 1].file_id;
          state.broadcastData.text = msg.caption || '';
        } else if (msg.text) {
          state.broadcastData.text = msg.text;
          state.broadcastData.photo = null;
        } else {
          return bot.sendMessage(chatId, '⚠️ Please send a text message or a photo with caption.');
        }

        state.step = 'awaiting_broadcast_btn_choice';
        const step2Text =
`🔗 *STEP 2 OF 3: ATTACH INLINE LINK / BUTTON* 🔗\n` +
`────────────────────────\n` +
`Content captured successfully!\n\n` +
`Do you want to attach a clickable inline button (e.g. Channel link, payment proof, or website) to this broadcast?`;

        return bot.sendMessage(chatId, step2Text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Add Button & Link', callback_data: 'bc_add_btn' },
                { text: '⏭️ Skip (No Button)', callback_data: 'bc_skip_btn' }
              ],
              [
                { text: '🚫 Cancel Broadcast', callback_data: 'admin_refresh' }
              ]
            ]
          }
        });
      }

      // 3. Broadcast Step 2: Button Name & Link Input
      if (state.step === 'awaiting_broadcast_btn_input') {
        const input = (msg.text || '').trim();
        if (!input.includes('|')) {
          return bot.sendMessage(chatId,
`⚠️ *Invalid Format!*\n` +
`Please separate the title and link with a pipe character (\`|\`).\n\n` +
`*Format:* \`Button Title | https://link\`\n` +
`*Example:* \`🚀 Join Channel | https://t.me/Meta_Farming_Payment_Proof\`\n\n` +
`Or skip by clicking below:`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⏭️ Skip Button', callback_data: 'bc_skip_btn' }],
                [{ text: '🚫 Cancel Broadcast', callback_data: 'admin_refresh' }]
              ]
            }
          });
        }

        const parts = input.split('|');
        const btnText = parts[0].trim();
        const btnUrl = parts.slice(1).join('|').trim();

        if (!btnText || (!btnUrl.startsWith('http://') && !btnUrl.startsWith('https://') && !btnUrl.startsWith('tg://'))) {
          return bot.sendMessage(chatId, '❌ Invalid URL. Link must start with `https://` or `http://` or `tg://`. Please try again:', { parse_mode: 'Markdown' });
        }

        state.broadcastData.button = { text: btnText, url: btnUrl };
        state.step = 'awaiting_broadcast_confirm';
        return showBroadcastPreview(chatId, state.broadcastData);
      }

      // 4. Add / Adjust Deposit Balance Input
      if (state.step === 'awaiting_deposit_amount') {
        const amount = parseFloat(msg.text);
        const targetUserId = state.targetUserId;
        delete adminState[chatId];

        if (isNaN(amount) || amount === 0) {
          return bot.sendMessage(chatId, '❌ Invalid amount. Action cancelled.', {
            reply_markup: { inline_keyboard: [[{ text: '👤 Back to Profile', callback_data: `view_user_${targetUserId}` }]] }
          });
        }

        try {
          const updated = await adjustUserBalance(targetUserId, amount, 'deposit_balance');

          if (amount > 0) {
            sendNotificationToUser(targetUserId, 
`📥 *Deposit Balance Credited!* 💳\n\n` +
`Admin @${AUTHORIZED_ADMIN_USERNAME} has credited your Deposit Balance with:\n` +
`• 💵 *Amount:* +$${amount.toFixed(2)} USDT\n` +
`• 💰 *New Deposit Balance:* $${Number(updated.deposit_balance).toFixed(2)} USDT\n\n` +
`You can use this balance immediately to activate higher Mining Plans!`
            );
          }

          const confirmText =
`✅ *DEPOSIT BALANCE ADJUSTED!* ✅\n` +
`────────────────────────\n` +
`• 👤 *User:* ${updated.first_name || ''} (@${updated.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${targetUserId}\`\n` +
`• 💳 *Adjustment:* \`${amount >= 0 ? '+' : ''}$${amount.toFixed(2)} USDT\`\n` +
`• 📥 *New Deposit Balance:* \`$${Number(updated.deposit_balance).toFixed(2)} USDT\`\n` +
`• 💵 *Withdrawable Balance:* \`$${Number(updated.wallet_balance).toFixed(4)} USDT\``;

          return bot.sendMessage(chatId, confirmText, {
            parse_mode: 'Markdown',
            reply_markup: getUserActionButtons(targetUserId)
          });
        } catch (err) {
          return bot.sendMessage(chatId, '❌ Failed to adjust deposit balance: ' + err.message);
        }
      }

      // 5. Add / Adjust Wallet Balance Input
      if (state.step === 'awaiting_wallet_amount') {
        const amount = parseFloat(msg.text);
        const targetUserId = state.targetUserId;
        delete adminState[chatId];

        if (isNaN(amount) || amount === 0) {
          return bot.sendMessage(chatId, '❌ Invalid amount. Action cancelled.', {
            reply_markup: { inline_keyboard: [[{ text: '👤 Back to Profile', callback_data: `view_user_${targetUserId}` }]] }
          });
        }

        try {
          const updated = await adjustUserBalance(targetUserId, amount, 'wallet_balance');

          if (amount > 0) {
            sendNotificationToUser(targetUserId, 
`🎉 *Withdrawable Balance Credited!* 💸\n\n` +
`Admin @${AUTHORIZED_ADMIN_USERNAME} has credited your Withdrawable Balance with:\n` +
`• 💵 *Amount:* +$${amount.toFixed(2)} USDT\n` +
`• 💰 *New Withdrawable Balance:* $${Number(updated.wallet_balance).toFixed(4)} USDT\n\n` +
`You can withdraw this amount or hold it in your account!`
            );
          }

          const confirmText =
`✅ *WALLET BALANCE ADJUSTED!* ✅\n` +
`────────────────────────\n` +
`• 👤 *User:* ${updated.first_name || ''} (@${updated.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${targetUserId}\`\n` +
`• 💸 *Adjustment:* \`${amount >= 0 ? '+' : ''}$${amount.toFixed(2)} USDT\`\n` +
`• 💵 *New Withdrawable Balance:* \`$${Number(updated.wallet_balance).toFixed(4)} USDT\`\n` +
`• 📥 *Deposit Balance:* \`$${Number(updated.deposit_balance).toFixed(2)} USDT\``;

          return bot.sendMessage(chatId, confirmText, {
            parse_mode: 'Markdown',
            reply_markup: getUserActionButtons(targetUserId)
          });
        } catch (err) {
          return bot.sendMessage(chatId, '❌ Failed to adjust wallet balance: ' + err.message);
        }
      }
    });

    // Handle Admin Callbacks
    bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const from = query.from;
      const data = query.data;

      if (!isAuthorizedAdmin(from)) {
        bot.answerCallbackQuery(query.id, { text: '⛔ Unauthorized access!' });
        return;
      }

      savedAdminChatId = chatId;
      bot.answerCallbackQuery(query.id).catch(() => {});

      // 1. Refresh Dashboard
      if (data === 'admin_refresh') {
        delete adminState[chatId];
        return sendAdminDashboard(chatId, query.message.message_id);
      }

      // 2. View Pending Withdrawals
      if (data === 'admin_pending_wd') {
        try {
          const pending = await getPendingWithdrawals();
          if (pending.length === 0) {
            return bot.sendMessage(chatId, '✅ There are no pending withdrawal requests at this time!', {
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          for (const item of pending.slice(0, 5)) {
            const netAmount = Math.max(0, Number(item.amount) - 1.0);
            const text = 
`⏳ *PENDING WITHDRAWAL REQUEST #${item.id}*\n` +
`────────────────────────\n` +
`• 👤 *User:* ${item.first_name || ''} ${item.last_name || ''} (@${item.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${item.telegram_id}\`\n` +
`• 💰 *Withdrawable Balance:* \`$${Number(item.wallet_balance || 0).toFixed(2)} USDT\`\n` +
`• 📥 *Deposit Balance:* \`$${Number(item.deposit_balance || 0).toFixed(2)} USDT\`\n` +
`• 💸 *Gross Withdrawal:* \`$${Number(item.amount).toFixed(2)} USDT\`\n` +
`• 💵 *Net Payout to Send:* \`$${netAmount.toFixed(2)} USDT\` ($1.00 Network Fee)\n` +
`• 🔒 *Destination BEP20 Address:*\n\`${item.wallet_address || 'N/A'}\`\n` +
`• 👥 *Total Referrals:* \`${item.total_referrals || 0}\`\n` +
`• 🔥 *Payout Mode:* Instant On-Chain from Hot Wallet\n` +
`• 📅 *Request Date:* ${new Date(item.created_at).toLocaleString()}`;

            const buttons = {
              inline_keyboard: [
                [
                  { text: '⚡ Approve & Auto-Payout', callback_data: `approve_wd_${item.id}` },
                  { text: '❌ Reject & Refund', callback_data: `reject_wd_${item.id}` }
                ],
                [
                  { text: '👤 View Full Profile', callback_data: `view_user_${item.telegram_id}` },
                  { text: '📜 Transaction History', callback_data: `user_tx_${item.telegram_id}` }
                ]
              ]
            };

            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buttons });
          }
        } catch (err) {
          console.error('Error fetching pending withdrawals:', err);
          bot.sendMessage(chatId, 'Error: ' + err.message);
        }
      }

      // Hot Wallet Card Callback
      if (data === 'admin_hot_wallet') {
        return sendHotWalletCard(chatId, query.message ? query.message.message_id : null);
      }

      // 3. View Recent Deposits
      if (data === 'admin_recent_dp') {
        try {
          const deposits = await getRecentDeposits(10);
          if (deposits.length === 0) {
            return bot.sendMessage(chatId, 'No verified deposits found.', {
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          let text = `📥 *RECENT VERIFIED DEPOSITS (BEP20 USDT)* 📥\n\n`;
          deposits.forEach((dp, idx) => {
            text += `*${idx + 1}. $${Number(dp.amount).toFixed(2)} USDT*\n`;
            text += `   • User: ${dp.first_name || 'User'} (@${dp.username || 'N/A'}) - ID: \`${dp.telegram_id}\`\n`;
            text += `   • Network: ${dp.network || 'BEP20'}\n`;
            if (dp.tx_hash) {
              text += `   • TxID: \`${dp.tx_hash.slice(0, 16)}...\`\n`;
            }
            text += `   • Time: ${new Date(dp.created_at).toLocaleString()}\n\n`;
          });

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        } catch (err) {
          console.error('Error fetching deposits:', err);
          bot.sendMessage(chatId, 'Error: ' + err.message);
        }
      }

      // 4. Prompt Search User
      if (data === 'admin_search_prompt') {
        adminState[chatId] = 'awaiting_search';
        return bot.sendMessage(chatId, '🔍 *Search User Account*\n\nPlease send the Telegram Username (e.g. `@johndoe`) or Telegram ID to inspect:', {
          parse_mode: 'Markdown'
        });
      }

      // 5. Prompt Broadcast (Rich Step-by-Step Flow)
      if (data === 'admin_broadcast_prompt') {
        return startBroadcastFlow(chatId);
      }

      // Broadcast Step 2 Callback: Add Button & Link
      if (data === 'bc_add_btn') {
        if (!adminState[chatId] || !adminState[chatId].broadcastData) {
          return startBroadcastFlow(chatId);
        }
        adminState[chatId].step = 'awaiting_broadcast_btn_input';
        return bot.sendMessage(chatId,
`🔗 *ENTER BUTTON TITLE & URL* 🔗\n` +
`────────────────────────\n` +
`Please reply with the button title and link separated by a pipe (\`|\`):\n\n` +
`*Format:*\n` +
`\`Button Title | https://your-link.com\`\n\n` +
`*Example:*\n` +
`\`🚀 Join Official Channel | https://t.me/Meta_Farming_Payment_Proof\`\n\n` +
`_Type /cancel to abort._`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⏭️ Skip Button (Send as is)', callback_data: 'bc_skip_btn' }],
              [{ text: '🚫 Cancel Broadcast', callback_data: 'admin_refresh' }]
            ]
          }
        });
      }

      // Broadcast Step 2 Callback: Skip Button
      if (data === 'bc_skip_btn') {
        if (!adminState[chatId] || !adminState[chatId].broadcastData) {
          return startBroadcastFlow(chatId);
        }
        adminState[chatId].broadcastData.button = null;
        adminState[chatId].step = 'awaiting_broadcast_confirm';
        return showBroadcastPreview(chatId, adminState[chatId].broadcastData);
      }

      // Broadcast Step 3 Callback: Launch Real-Time Broadcast
      if (data === 'bc_launch') {
        if (!adminState[chatId] || !adminState[chatId].broadcastData) {
          return bot.sendMessage(chatId, '⚠️ No pending broadcast found. Click below to start:', {
            reply_markup: { inline_keyboard: [[{ text: '📢 Start Broadcast', callback_data: 'admin_broadcast_prompt' }]] }
          });
        }
        const bData = adminState[chatId].broadcastData;
        delete adminState[chatId];
        return executeRichBroadcast(chatId, bData);
      }

      // 6. View User List (Recent 10)
      if (data === 'admin_users_list') {
        try {
          const usersRes = await pool.query(
            `SELECT telegram_id, first_name, username, wallet_balance, deposit_balance, total_deposit, total_withdraw, total_referrals 
             FROM users 
             ORDER BY created_at DESC 
             LIMIT 10`
          );

          let text = `👥 *LATEST 10 REGISTERED USERS* 👥\n\n`;
          usersRes.rows.forEach((u, i) => {
            text += `*${i + 1}. ${u.first_name || 'User'}* (@${u.username || 'N/A'})\n`;
            text += `   • ID: \`${u.telegram_id}\`\n`;
            text += `   • Balances: $${Number(u.wallet_balance).toFixed(2)} Wallet | $${Number(u.deposit_balance).toFixed(2)} Deposit\n`;
            text += `   • Deposited: $${Number(u.total_deposit).toFixed(2)} | Withdrawn: $${Number(u.total_withdraw).toFixed(2)}\n`;
            text += `   • Referrals: \`${u.total_referrals || 0}\`\n\n`;
          });

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔍 Search Specific User', callback_data: 'admin_search_prompt' },
                  { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            }
          });
        } catch (err) {
          console.error('Error listing users:', err);
        }
      }

      // 7. Top Referrers Leaderboard
      if (data === 'admin_top_referrers') {
        try {
          const topList = await getTopReferrers(10);
          if (topList.length === 0) {
            return bot.sendMessage(chatId, 'No referrals found yet.', {
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          let text = `🏆 *TOP 10 REFERRERS LEADERBOARD* 🏆\n\n`;
          topList.forEach((r, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
            text += `${medal} *#${idx + 1} ${r.first_name || 'User'}* (@${r.username || 'N/A'})\n`;
            text += `   • ID: \`${r.telegram_id}\`\n`;
            text += `   • Total Referrals: \`${r.total_referrals} miners\`\n`;
            text += `   • Commissions Earned: \`$${Number(r.total_referral_bonus).toFixed(2)} USDT\`\n`;
            text += `   • Mining Speed: \`${Number(r.hashrate).toFixed(2)} GH/s\`\n\n`;
          });

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        } catch (err) {
          console.error('Error fetching top referrers:', err);
        }
      }

      // 8. Top Investors Leaderboard
      if (data === 'admin_top_investors') {
        try {
          const topInvestors = await getTopInvestors(10);
          if (topInvestors.length === 0) {
            return bot.sendMessage(chatId, 'No investor deposit records found yet.', {
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          let text = `💎 *TOP 10 INVESTORS LEADERBOARD* 💎\n\n`;
          topInvestors.forEach((inv, idx) => {
            const medal = idx === 0 ? '👑' : idx === 1 ? '⭐' : idx === 2 ? '✨' : '•';
            text += `${medal} *#${idx + 1} ${inv.first_name || 'Investor'}* (@${inv.username || 'N/A'})\n`;
            text += `   • ID: \`${inv.telegram_id}\`\n`;
            text += `   • Total Deposited: \`$${Number(inv.total_deposit).toFixed(2)} USDT\`\n`;
            text += `   • Active Deposit Balance: \`$${Number(inv.deposit_balance).toFixed(2)} USDT\`\n`;
            text += `   • Total Hashrate: \`${Number(inv.hashrate).toFixed(2)} GH/s\`\n\n`;
          });

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        } catch (err) {
          console.error('Error fetching top investors:', err);
        }
      }

      // 9. Financial Overview & Reserve Analysis
      if (data === 'admin_system_finance') {
        try {
          const stats = await getBotGlobalStats();
          const pending = await getPendingWithdrawals();

          const totalDeposit = Number(stats.total_bot_deposit || 0);
          const totalWithdraw = Number(stats.total_bot_withdraw || 0);
          const totalUserWallet = Number(stats.total_user_wallet_balance || 0);
          const totalUserDeposit = Number(stats.total_user_deposit_balance || 0);
          const pendingWdAmount = pending.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
          const netPlatformProfit = totalDeposit - totalWithdraw;

          const text = 
`💼 *SYSTEM FINANCIAL HEALTH & LIABILITIES* 💼\n` +
`────────────────────────\n\n` +
`💰 *Cashflow Overview:*\n` +
`• 📥 *Total Inflow (Deposits):* \`$${totalDeposit.toFixed(2)} USDT\`\n` +
`• 💸 *Total Outflow (Withdrawals):* \`$${totalWithdraw.toFixed(2)} USDT\`\n` +
`• 🏦 *Platform Net Cash Surplus:* \`$${netPlatformProfit.toFixed(2)} USDT\`\n\n` +
`⚠️ *Outstanding Liabilities:*\n` +
`• ⏳ *Pending Withdrawals:* \`$${pendingWdAmount.toFixed(2)} USDT\` (${pending.length} txs)\n` +
`• 💵 *Users Withdrawable Balance:* \`$${totalUserWallet.toFixed(2)} USDT\`\n` +
`• 📦 *Active Deposit Locked Balances:* \`$${totalUserDeposit.toFixed(2)} USDT\`\n` +
`• 🎁 *Referral Commissions Distributed:* \`$${Number(stats.total_referral_commissions || 0).toFixed(2)} USDT\``;

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        } catch (err) {
          console.error('Error fetching financial overview:', err);
        }
      }

      // 10. Approve Withdrawal Action (`approve_wd_<id>`)
      if (data.startsWith('approve_wd_')) {
        const txId = data.replace('approve_wd_', '');
        try {
          // 1. Fetch pending transaction
          const txRes = await pool.query('SELECT * FROM transactions WHERE id = $1 AND status = \'Pending\'', [txId]);
          if (txRes.rows.length === 0) {
            return bot.sendMessage(chatId, `⚠️ Withdrawal request #${txId} was not found or has already been processed.`);
          }
          const pendingTx = txRes.rows[0];

          // 2. Calculate net amount to send
          const grossAmount = Number(pendingTx.amount);
          const netAmount = Math.max(0, grossAmount - 1.0);
          const amountToSend = netAmount > 0 ? netAmount : grossAmount;

          // 3. Notify admin in real time that blockchain transaction is in progress
          await bot.editMessageText(
`⏳ *BROADCASTING PAYOUT ON BSC BLOCKCHAIN...* ⏳\n` +
`────────────────────────\n` +
`• 🆔 *Tx ID:* #${pendingTx.id}\n` +
`• 💸 *Sending Net Payout:* \`$${amountToSend.toFixed(2)} USDT\` (BEP20)\n` +
`• 🔒 *Destination BEP20:*\n\`${pendingTx.wallet_address}\`\n\n` +
`_Signing and broadcasting on-chain transfer from Hot Wallet. Please wait 5-10 seconds for confirmation..._`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown'
            }
          ).catch(() => {});

          // 4. Send on-chain payout from Hot Wallet
          let payoutResult;
          try {
            payoutResult = await sendUsdtPayout({
              toAddress: pendingTx.wallet_address,
              amount: amountToSend
            });
          } catch (payoutErr) {
            console.error(`[HotWallet] Payout failed for Tx #${txId}:`, payoutErr.message);

            const failureMsg =
`❌ *HOT WALLET PAYOUT FAILED!* ❌\n` +
`────────────────────────\n` +
`• 🆔 *Tx ID:* #${pendingTx.id}\n` +
`• 💸 *Attempted Amount:* \`$${amountToSend.toFixed(2)} USDT\`\n` +
`• 🔒 *Recipient Address:*\n\`${pendingTx.wallet_address}\`\n` +
`• ⚠️ *Reason:*\n\`${payoutErr.message}\`\n\n` +
`💡 *No funds were lost.* The withdrawal request is still *PENDING*. Check Hot Wallet gas (BNB) or USDT balance and click Retry below:`;

            return bot.editMessageText(failureMsg, {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🔄 Retry Auto-Payout', callback_data: `approve_wd_${pendingTx.id}` },
                    { text: '❌ Reject & Refund', callback_data: `reject_wd_${pendingTx.id}` }
                  ],
                  [
                    { text: '🔥 Check Hot Wallet', callback_data: 'admin_hot_wallet' },
                    { text: '🔙 Dashboard', callback_data: 'admin_refresh' }
                  ]
                ]
              }
            }).catch(async () => {
              await bot.sendMessage(chatId, failureMsg, { parse_mode: 'Markdown' });
            });
          }

          // 5. Update DB record to Completed with the real blockchain txHash
          const payoutTxHash = payoutResult.txHash;
          const result = await approveWithdrawal(txId, payoutTxHash);
          const { transaction, user } = result;

          // 6. Fetch updated hot wallet balance for report
          const hotBal = await getHotWalletBalances();

          // 7. Edit admin message to show completed payout
          const approvedMsg = 
`✅ *PAYOUT SENT ON-CHAIN VIA HOT WALLET!* ✅\n` +
`────────────────────────\n` +
`• 🆔 *Tx ID:* #${transaction.id}\n` +
`• 👤 *User:* ${user.first_name || ''} (@${user.username || 'N/A'})\n` +
`• 💸 *Gross Withdrawal:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`• 💵 *Net Sent to User:* \`$${amountToSend.toFixed(2)} USDT\` ($1.00 Network Fee)\n` +
`• 🔒 *Destination BEP20:*\n\`${transaction.wallet_address}\`\n` +
`• 🔗 *BSCscan TxHash:*\n\`${payoutTxHash}\`\n` +
`• ⛽ *Hot Wallet Remaining:* \`$${hotBal.usdtBalance} USDT\` (${hotBal.bnbBalance} BNB)\n` +
`• 📅 *Status:* Completed & Confirmed On-Chain ✅\n` +
`• 👑 *Approved By:* @${AUTHORIZED_ADMIN_USERNAME}`;

          await bot.editMessageText(approvedMsg, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔗 View on BSCscan', url: `https://bscscan.com/tx/${payoutTxHash}` },
                  { text: '🔥 Hot Wallet', callback_data: 'admin_hot_wallet' }
                ],
                [
                  { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            }
          }).catch(async () => {
            await bot.sendMessage(chatId, approvedMsg, { parse_mode: 'Markdown' });
          });

          // 8. Send confirmation message to the User via Main Bot (@Meta_Farming_bot) with BscScan & Payout channel buttons
          notifyUserWithdrawalApproved(transaction.telegram_id, {
            amount: amountToSend,
            address: transaction.wallet_address,
            payoutTxHash,
            network: transaction.network || 'BEP20'
          });

        } catch (err) {
          console.error('Error approving withdrawal:', err);
          bot.sendMessage(chatId, '❌ Failed to approve withdrawal: ' + err.message);
        }
      }

      // 11. Reject Withdrawal Action (`reject_wd_<id>`)
      if (data.startsWith('reject_wd_')) {
        const txId = data.replace('reject_wd_', '');
        try {
          const result = await rejectWithdrawal(txId, 'Rejected by Admin @' + AUTHORIZED_ADMIN_USERNAME);
          const { transaction, user } = result;

          // Edit admin message to show Rejected
          const rejectedMsg = 
`❌ *WITHDRAWAL REJECTED & REFUNDED!* ❌\n` +
`────────────────────────\n` +
`• 🆔 *Tx ID:* #${transaction.id}\n` +
`• 👤 *User:* ${user.first_name || ''} (@${user.username || 'N/A'})\n` +
`• 💸 *Amount:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`• ↩️ *Refund:* \`$${Number(transaction.amount).toFixed(2)} USDT\` refunded to user balance.\n` +
`• 📅 *Status:* Rejected ❌\n` +
`• 👑 *Action By:* @${AUTHORIZED_ADMIN_USERNAME}`;

          await bot.editMessageText(rejectedMsg, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          }).catch(async () => {
            await bot.sendMessage(chatId, rejectedMsg, { parse_mode: 'Markdown' });
          });

          // Send rejection notice to user via Main Bot
          const userAlert = 
`⚠️ *Your Withdrawal Request Was Rejected* ⚠️\n\n` +
`💰 *Amount:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`The withdrawal amount has been fully refunded back to your main account balance.\n\n` +
`If you have questions, please reach out to our official support.`;

          sendNotificationToUser(transaction.telegram_id, userAlert);

        } catch (err) {
          console.error('Error rejecting withdrawal:', err);
          bot.sendMessage(chatId, '❌ Failed to reject withdrawal: ' + err.message);
        }
      }

      // 12. View User Full Profile (`view_user_<id>`)
      if (data.startsWith('view_user_')) {
        const targetUserId = data.replace('view_user_', '');
        try {
          const target = await getUserFullDetails(targetUserId);
          if (!target) {
            return bot.sendMessage(chatId, '❌ User profile not found.');
          }

          const profileText = renderUserProfile(target);
          await bot.sendMessage(chatId, profileText, {
            parse_mode: 'Markdown',
            reply_markup: getUserActionButtons(target.telegram_id)
          });
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      }

      // Gift Plan Selection Card (`gift_plan_<id>`)
      if (data.startsWith('gift_plan_')) {
        const targetUserId = data.replace('gift_plan_', '');
        try {
          const user = await getUserFullDetails(targetUserId);
          if (!user) return bot.sendMessage(chatId, '❌ User not found.');

          const text = 
`🎁 *GIFT MINING POWER PLAN TO USER* 🎁\n` +
`────────────────────────\n` +
`• 👤 *User:* ${user.first_name || ''} (@${user.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${user.telegram_id}\`\n` +
`• ⚡ *Current Daily Rate:* \`${Number(user.daily_mining_rate).toFixed(4)} USDT/day\`\n` +
`• 🚀 *Current Hashrate:* \`${Number(user.hashrate).toFixed(2)} GH/s\`\n\n` +
`Select a mining package below to gift for FREE to this user:`;

          const buttons = {
            inline_keyboard: [
              [
                { text: '🥉 Bronze ($3 | +0.12/d)', callback_data: `apply_gift_${targetUserId}_bronze-3` },
                { text: '🥈 Silver ($5 | +0.25/d)', callback_data: `apply_gift_${targetUserId}_silver-5` }
              ],
              [
                { text: '🥇 Gold ($20 | +1.10/d)', callback_data: `apply_gift_${targetUserId}_gold-20` },
                { text: '💎 Platinum ($50 | +3.00/d)', callback_data: `apply_gift_${targetUserId}_platinum-50` }
              ],
              [
                { text: '👑 Diamond ($100 | +6.50/d)', callback_data: `apply_gift_${targetUserId}_diamond-100` },
                { text: '⚡ Titanium ($200 | +14.00/d)', callback_data: `apply_gift_${targetUserId}_titanium-200` }
              ],
              [
                { text: '🌌 Quantum Ultra ($500 | +38.00/d)', callback_data: `apply_gift_${targetUserId}_quantum-500` }
              ],
              [
                { text: '🔙 Back to User Profile', callback_data: `view_user_${targetUserId}` }
              ]
            ]
          };

          await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: buttons
          }).catch(async () => {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buttons });
          });
        } catch (err) {
          bot.sendMessage(chatId, '❌ Error: ' + err.message);
        }
      }

      // Execute Plan Gift (`apply_gift_<id>_<planId>`)
      if (data.startsWith('apply_gift_')) {
        const payload = data.replace('apply_gift_', '');
        const underscoreIdx = payload.indexOf('_');
        const targetUserId = payload.substring(0, underscoreIdx);
        const planId = payload.substring(underscoreIdx + 1);

        const plan = DEPOSIT_MINING_PLANS.find(p => p.id === planId);
        if (!plan) return bot.sendMessage(chatId, '❌ Mining Plan not found.');

        try {
          const updated = await giftMiningPlanToUser({
            telegramId: targetUserId,
            planId: plan.id,
            planName: plan.name,
            dailyProfit: plan.dailyProfit,
            hashrateBonus: plan.hashrate,
            adminUsername: AUTHORIZED_ADMIN_USERNAME
          });

          // Send surprise notification to user via Main Bot
          const userAlert =
`🎁 *SPECIAL GIFT FROM ADMIN!* 🎁\n\n` +
`Congratulations! Admin @${AUTHORIZED_ADMIN_USERNAME} has gifted you a free mining package:\n` +
`• 📦 *Plan:* ${plan.name} ($${plan.price}.00 value)\n` +
`• ⚡ *Daily Profit Boost:* +$${plan.dailyProfit} USDT/day\n` +
`• 🚀 *Hashrate Boost:* +${plan.hashrateDisplay}\n\n` +
`Your mining speed has been upgraded permanently! Happy Mining 🚀`;

          sendNotificationToUser(targetUserId, userAlert);

          const successMsg =
`✅ *MINING PLAN GIFTED SUCCESSFULLY!* ✅\n` +
`────────────────────────\n` +
`• 👤 *User:* ${updated.first_name || ''} (@${updated.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${targetUserId}\`\n` +
`• 🎁 *Gifted Plan:* ${plan.name} ($${plan.price}.00 value)\n` +
`• ⚡ *New Daily Rate:* \`${Number(updated.daily_mining_rate).toFixed(4)} USDT/day\`\n` +
`• 🚀 *New Hashrate:* \`${Number(updated.hashrate).toFixed(2)} GH/s\`\n` +
`• 📦 *Active Plans:* ${(updated.purchased_plans || []).length}\n\n` +
`_The user has been notified instantly via the main bot._`;

          await bot.editMessageText(successMsg, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '👤 View User Profile', callback_data: `view_user_${targetUserId}` },
                  { text: '🎁 Gift Another Plan', callback_data: `gift_plan_${targetUserId}` }
                ],
                [
                  { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            }
          }).catch(async () => {
            await bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
          });
        } catch (err) {
          bot.sendMessage(chatId, '❌ Failed to gift plan: ' + err.message);
        }
      }

      // Prompt Add Deposit Balance (`add_dep_prompt_<id>`)
      if (data.startsWith('add_dep_prompt_')) {
        const targetUserId = data.replace('add_dep_prompt_', '');
        adminState[chatId] = {
          step: 'awaiting_deposit_amount',
          targetUserId
        };
        return bot.sendMessage(chatId,
`💰 *ADD / ADJUST DEPOSIT BALANCE* 💰\n` +
`────────────────────────\n` +
`👤 *Target User ID:* \`${targetUserId}\`\n\n` +
`Please reply with the amount of USDT to add or subtract to their Deposit Balance:\n` +
`• Send \`10\` or \`50.00\` to credit (add)\n` +
`• Send \`-10\` to debit (subtract)\n\n` +
`_Type /cancel to abort._`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🚫 Cancel', callback_data: `view_user_${targetUserId}` }]]
          }
        });
      }

      // Prompt Add Wallet Balance (`add_wal_prompt_<id>`)
      if (data.startsWith('add_wal_prompt_')) {
        const targetUserId = data.replace('add_wal_prompt_', '');
        adminState[chatId] = {
          step: 'awaiting_wallet_amount',
          targetUserId
        };
        return bot.sendMessage(chatId,
`💵 *ADD / ADJUST WITHDRAWABLE WALLET BALANCE* 💵\n` +
`────────────────────────\n` +
`👤 *Target User ID:* \`${targetUserId}\`\n\n` +
`Please reply with the amount of USDT to add or subtract to their main withdrawable wallet:\n` +
`• Send \`5\` or \`100.00\` to credit (add)\n` +
`• Send \`-5\` to debit (subtract)\n\n` +
`_Type /cancel to abort._`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🚫 Cancel', callback_data: `view_user_${targetUserId}` }]]
          }
        });
      }

      // 13. View User Transaction History (`user_tx_<id>`)
      if (data.startsWith('user_tx_')) {
        const targetUserId = data.replace('user_tx_', '');
        try {
          const txList = await getUserTransactions(targetUserId, 10);
          if (txList.length === 0) {
            return bot.sendMessage(chatId, `No transactions found for user ID: \`${targetUserId}\``, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          let text = `📜 *TRANSACTION HISTORY FOR USER ${targetUserId}:*\n\n`;
          txList.forEach((tx, idx) => {
            text += `*${idx + 1}. ${tx.type}* | \`$${Number(tx.amount).toFixed(2)} USDT\`\n`;
            text += `   • Status: *${tx.status}*\n`;
            text += `   • Date: ${new Date(tx.created_at).toLocaleString()}\n`;
            if (tx.tx_hash) {
              text += `   • TxHash: \`${tx.tx_hash.slice(0, 16)}...\`\n`;
            }
            if (tx.wallet_address) {
              text += `   • Address: \`${tx.wallet_address.slice(0, 14)}...\`\n`;
            }
            text += `\n`;
          });

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '👤 Back to Profile', callback_data: `view_user_${targetUserId}` },
                  { text: '🔙 Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            }
          });
        } catch (err) {
          console.error('Error fetching user transactions:', err);
        }
      }

      // 14. Reset User Locked BEP20 Address (`reset_addr_<id>`)
      if (data.startsWith('reset_addr_')) {
        const targetUserId = data.replace('reset_addr_', '');
        try {
          await resetUserWithdrawAddress(targetUserId);
          bot.sendMessage(chatId, `✅ *BEP20 Address Reset Successfully!*\n\nUser ID \`${targetUserId}\` can now enter a new BEP20 address on their next withdrawal.`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '👤 View Profile', callback_data: `view_user_${targetUserId}` },
                  { text: '🔙 Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            }
          });
        } catch (err) {
          bot.sendMessage(chatId, '❌ Failed to reset address: ' + err.message);
        }
      }
    });

    return bot;
  } catch (error) {
    console.error('Failed to start Admin Bot:', error.message);
    return null;
  }
}

// Push notification: When any user requests a withdrawal (100% English)
async function notifyAdminNewWithdrawal(withdrawalData) {
  if (!adminBotInstance || !savedAdminChatId) {
    return;
  }

  try {
    const netAmount = Math.max(0, Number(withdrawalData.amount) - 1.0);
    const hotBal = await getHotWalletBalances();
    const canPay = parseFloat(hotBal.usdtBalance || 0) >= netAmount;

    const text = 
`🚨 *NEW WITHDRAWAL REQUEST SUBMITTED!* 🚨\n` +
`────────────────────────\n` +
`• 🆔 *Tx ID:* #${withdrawalData.id || 'N/A'}\n` +
`• 👤 *User:* ${withdrawalData.firstName || ''} ${withdrawalData.lastName || ''} (@${withdrawalData.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${withdrawalData.telegramId}\`\n` +
`• 💰 *Current Wallet Balance:* \`$${Number(withdrawalData.walletBalance || 0).toFixed(2)} USDT\`\n` +
`• 📥 *Deposit Balance:* \`$${Number(withdrawalData.depositBalance || 0).toFixed(2)} USDT\`\n` +
`• 💸 *Gross Withdrawal:* \`$${Number(withdrawalData.amount).toFixed(2)} USDT\`\n` +
`• 💵 *Net Payout to Send:* \`$${netAmount.toFixed(2)} USDT\` ($1.00 Network Fee)\n` +
`• 🔒 *Destination BEP20 Address:*\n\`${withdrawalData.address}\`\n` +
`• 👥 *Total Referrals:* \`${withdrawalData.totalReferrals || 0}\`\n` +
`• 🔥 *Hot Wallet Balance:* \`$${hotBal.usdtBalance} USDT\` (${hotBal.bnbBalance} BNB)\n` +
`• ⚡ *Hot Wallet Status:* ${canPay ? '🟢 Ready to Auto-Pay' : '⚠️ Top Up Needed'}\n` +
`• 📅 *Request Date:* ${withdrawalData.date || new Date().toLocaleString()}\n\n` +
`Click below to approve instant on-chain payout from Hot Wallet or reject:`;

    const buttons = {
      inline_keyboard: [
        [
          { text: '⚡ Approve & Auto-Payout', callback_data: `approve_wd_${withdrawalData.id}` },
          { text: '❌ Reject & Refund', callback_data: `reject_wd_${withdrawalData.id}` }
        ],
        [
          { text: '🔥 Check Hot Wallet', callback_data: 'admin_hot_wallet' },
          { text: '👤 User Profile', callback_data: `view_user_${withdrawalData.telegramId}` }
        ],
        [
          { text: '📜 User Tx History', callback_data: `user_tx_${withdrawalData.telegramId}` }
        ]
      ]
    };

    await adminBotInstance.sendMessage(savedAdminChatId, text, {
      parse_mode: 'Markdown',
      reply_markup: buttons
    });
  } catch (err) {
    console.error('Error sending withdrawal alert to admin bot:', err.message);
  }
}

// Push notification: When any user verifies a deposit (100% English)
async function notifyAdminNewDeposit(depositData) {
  if (!adminBotInstance || !savedAdminChatId) {
    return;
  }

  try {
    const text = 
`📥 *NEW DEPOSIT VERIFIED & CREDITED!* 📥\n` +
`────────────────────────\n` +
`• 👤 *User:* ${depositData.firstName || ''} ${depositData.lastName || ''} (@${depositData.username || 'N/A'})\n` +
`• 🆔 *Telegram ID:* \`${depositData.telegramId}\`\n` +
`• 💵 *Deposit Amount:* \`+$${Number(depositData.amount).toFixed(2)} USDT (BEP20)\`\n` +
`• 💰 *New Deposit Balance:* \`$${Number(depositData.depositBalance || 0).toFixed(2)} USDT\`\n` +
`• 💳 *Total Deposited All-Time:* \`$${Number(depositData.totalDeposit || 0).toFixed(2)} USDT\`\n` +
`• 👥 *Referred By:* \`${depositData.referredBy || 'Direct'}\`\n` +
`• 🔗 *BSCscan Transaction Hash:*\n\`${depositData.txHash}\`\n` +
`• 📅 *Date:* ${depositData.date || new Date().toLocaleString()}`;

    const buttons = {
      inline_keyboard: [
        [
          { text: '👤 View User Profile', callback_data: `view_user_${depositData.telegramId}` },
          { text: '🔗 View on BSCscan', url: `https://bscscan.com/tx/${depositData.txHash}` }
        ]
      ]
    };

    await adminBotInstance.sendMessage(savedAdminChatId, text, {
      parse_mode: 'Markdown',
      reply_markup: buttons
    });
  } catch (err) {
    console.error('Error sending deposit alert to admin bot:', err.message);
  }
}

module.exports = {
  initAdminBot,
  notifyAdminNewWithdrawal,
  notifyAdminNewDeposit
};
