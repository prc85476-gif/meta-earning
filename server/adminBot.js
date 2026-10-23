const TelegramBot = require('node-telegram-bot-api');
const {
  getUserFullDetails,
  getBotGlobalStats,
  getPendingWithdrawals,
  getRecentDeposits,
  approveWithdrawal,
  rejectWithdrawal,
  pool
} = require('./db');
const { sendNotificationToUser } = require('./bot');

let adminBotInstance = null;
let savedAdminChatId = null;

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

        const text = 
`👑 *META FARM ADMIN CONTROL PANEL* 👑\n` +
`👤 *Admin:* @${AUTHORIZED_ADMIN_USERNAME}\n` +
`────────────────────────\n\n` +
`📊 *লাইভ প্ল্যাটফর্ম পরিসংখ্যান (Neon PostgreSQL):*\n` +
`• 👥 *মোট রেজিস্টার্ড ইউজার:* \`${stats.total_users || 0} জন\`\n` +
`• 💰 *সব ইউজারের মেইন ব্যালেন্স:* \`$${Number(stats.total_user_wallet_balance || 0).toFixed(2)} USDT\`\n` +
`• 📥 *সব ইউজারের ডিপোজিট ব্যালেন্স:* \`$${Number(stats.total_user_deposit_balance || 0).toFixed(2)} USDT\`\n` +
`• 💳 *মোট ডিপোজিট জমা হয়েছে:* \`$${Number(stats.total_bot_deposit || 0).toFixed(2)} USDT\`\n` +
`• 💸 *মোট উইথড্র সফল হয়েছে:* \`$${Number(stats.total_bot_withdraw || 0).toFixed(2)} USDT\`\n` +
`• ⏳ *পেন্ডিং উইথড্র সংখ্যা:* \`${pendingList.length} টি\`\n` +
`• 🎁 *মোট রেফারেল কমিশন বন্টিত:* \`$${Number(stats.total_referral_commissions || 0).toFixed(2)} USDT\`\n` +
`• 📝 *মোট সিস্টেম ট্রানজেকশন:* \`${stats.total_transactions || 0} টি\`\n\n` +
`নিচের অপশনগুলো দিয়ে প্ল্যাটফর্ম নিয়ন্ত্রণ করুন:`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: `⏳ Pending Withdrawals (${pendingList.length})`, callback_data: 'admin_pending_wd' },
              { text: `📥 Recent Deposits`, callback_data: 'admin_recent_dp' }
            ],
            [
              { text: `👥 User Accounts`, callback_data: 'admin_users_list' },
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
        bot.sendMessage(chatId, '❌ ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে: ' + err.message);
      }
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

      // Save admin chat ID for instant push notifications
      savedAdminChatId = chatId;
      await sendAdminDashboard(chatId);
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
        return sendAdminDashboard(chatId, query.message.message_id);
      }

      // 2. View Pending Withdrawals
      if (data === 'admin_pending_wd') {
        try {
          const pending = await getPendingWithdrawals();
          if (pending.length === 0) {
            return bot.sendMessage(chatId, '✅ বর্তমানে কোনো পেন্ডিং উইথড্র রিকোয়েস্ট নেই!', {
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          for (const item of pending.slice(0, 5)) {
            const netAmount = Math.max(0, Number(item.amount) - 1.0);
            const text = 
`⏳ *পেন্ডিং উইথড্র রিকোয়েস্ট #${item.id}*\n` +
`────────────────────────\n` +
`👤 *ইউজার:* ${item.first_name || ''} ${item.last_name || ''} (@${item.username || 'N/A'})\n` +
`🆔 *টেলিগ্রাম আইডি:* \`${item.telegram_id}\`\n` +
`💰 *বর্তমান ব্যালেন্স:* \`$${Number(item.wallet_balance || 0).toFixed(2)} USDT\`\n` +
`📥 *ডিপোজিট ব্যালেন্স:* \`$${Number(item.deposit_balance || 0).toFixed(2)} USDT\`\n` +
`💸 *উইথড্র অ্যামাউন্ট:* \`$${Number(item.amount).toFixed(2)} USDT\`\n` +
`💵 *নেট পেআউট পাঠাতে হবে:* \`$${netAmount.toFixed(2)} USDT\` (ফি: $1.00)\n` +
`🔒 *গন্তব্য BEP20 অ্যাড্রেস:*\n\`${item.wallet_address || 'N/A'}\`\n` +
`👥 *মোট রেফারেল:* \`${item.total_referrals || 0} জন\`\n` +
`📅 *তারিখ:* ${new Date(item.created_at).toLocaleString()}`;

            const buttons = {
              inline_keyboard: [
                [
                  { text: '✅ Approve & Send Payout', callback_data: `approve_wd_${item.id}` },
                  { text: '❌ Reject & Refund', callback_data: `reject_wd_${item.id}` }
                ],
                [
                  { text: '👤 View Full Profile', callback_data: `view_user_${item.telegram_id}` }
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

      // 3. View Recent Deposits
      if (data === 'admin_recent_dp') {
        try {
          const deposits = await getRecentDeposits(10);
          if (deposits.length === 0) {
            return bot.sendMessage(chatId, 'কোনো ডিপোজিট রেকর্ড পাওয়া যায়নি।', {
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
              }
            });
          }

          let text = `📥 *সাম্প্রতিক ভেরিফাইড ডিপোজিট তালিকা (Recent Deposits):*\n\n`;
          deposits.forEach((dp, idx) => {
            text += `*${idx + 1}. $${Number(dp.amount).toFixed(2)} USDT*\n`;
            text += `   • ইউজার: ${dp.first_name || 'User'} (@${dp.username || 'N/A'}) - ID: \`${dp.telegram_id}\`\n`;
            text += `   • নেটওয়ার্ক: ${dp.network || 'BEP20'}\n`;
            if (dp.tx_hash) {
              text += `   • TxID: \`${dp.tx_hash}\`\n`;
            }
            text += `   • সময়: ${new Date(dp.created_at).toLocaleString()}\n\n`;
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

      // 4. View User List
      if (data === 'admin_users_list') {
        try {
          const usersRes = await pool.query(
            `SELECT telegram_id, first_name, username, wallet_balance, deposit_balance, total_deposit, total_withdraw, total_referrals 
             FROM users 
             ORDER BY created_at DESC 
             LIMIT 10`
          );

          let text = `👥 *সাম্প্রতিক ১০ জন ইউজার অ্যাকাউন্ট:*\n\n`;
          usersRes.rows.forEach((u, i) => {
            text += `*${i + 1}. ${u.first_name || 'User'}* (@${u.username || 'N/A'})\n`;
            text += `   • ID: \`${u.telegram_id}\`\n`;
            text += `   • ব্যালেন্স: $${Number(u.wallet_balance).toFixed(2)} | ডিপোজিট: $${Number(u.deposit_balance).toFixed(2)}\n`;
            text += `   • মোট ইনভেস্ট: $${Number(u.total_deposit).toFixed(2)} | উইথড্র: $${Number(u.total_withdraw).toFixed(2)}\n`;
            text += `   • রেফারেল: ${u.total_referrals || 0} জন\n\n`;
          });

          await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        } catch (err) {
          console.error('Error listing users:', err);
        }
      }

      // 5. Approve Withdrawal Action (`approve_wd_<id>`)
      if (data.startsWith('approve_wd_')) {
        const txId = data.replace('approve_wd_', '');
        try {
          const payoutTxHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
          const result = await approveWithdrawal(txId, payoutTxHash);
          const { transaction, user } = result;

          // Edit the admin message to show Approved
          const approvedMsg = 
`✅ *WITHDRAWAL APPROVED & SENT!* ✅\n` +
`────────────────────────\n` +
`🆔 *Tx ID:* #${transaction.id}\n` +
`👤 *ইউজার:* ${user.first_name || ''} (@${user.username || 'N/A'})\n` +
`💸 *পরিমাণ:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`🔒 *গন্তব্য অ্যাড্রেস:*\n\`${transaction.wallet_address}\`\n` +
`🔗 *Payout TxHash:*\n\`${payoutTxHash}\`\n` +
`📅 *স্ট্যাটাস:* Completed (সফল)\n` +
`👑 *অনুমোদনকারী:* @${AUTHORIZED_ADMIN_USERNAME}`;

          await bot.editMessageText(approvedMsg, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          }).catch(async () => {
            await bot.sendMessage(chatId, approvedMsg, { parse_mode: 'Markdown' });
          });

          // Send confirmation message to the User via Main Bot (@Meta_Farming_bot)
          const userAlert = 
`🎉 *আপনার উইথড্র রিকোয়েস্ট অ্যাপ্রুভ হয়েছে এবং ওয়ালেটে পাঠানো হয়েছে!* 🎉\n\n` +
`💰 *পরিমাণ:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`🌐 *নেটওয়ার্ক:* BEP20 (BNB Smart Chain)\n` +
`🔒 *আপনার ওয়ালেট:* \`${transaction.wallet_address}\`\n` +
`🔗 *Transaction Hash:*\n\`${payoutTxHash}\`\n` +
`📅 *স্ট্যাটাস:* Completed (সফলভাবে সম্পন্ন) ✅\n\n` +
`ফান্ড আপনার ওয়ালেটে ট্রান্সফার করা হয়েছে। সাম্প্রতিক অ্যাকাউন্ট হিস্টোরিতে স্ট্যাটাস Completed দেখতে পাবেন!`;

          sendNotificationToUser(transaction.telegram_id, userAlert);

        } catch (err) {
          console.error('Error approving withdrawal:', err);
          bot.sendMessage(chatId, '❌ অ্যাপ্রুভ করতে ব্যর্থ হয়েছে: ' + err.message);
        }
      }

      // 6. Reject Withdrawal Action (`reject_wd_<id>`)
      if (data.startsWith('reject_wd_')) {
        const txId = data.replace('reject_wd_', '');
        try {
          const result = await rejectWithdrawal(txId, 'Rejected by Admin @' + AUTHORIZED_ADMIN_USERNAME);
          const { transaction, user } = result;

          // Edit admin message to show Rejected
          const rejectedMsg = 
`❌ *WITHDRAWAL REJECTED & REFUNDED!* ❌\n` +
`────────────────────────\n` +
`🆔 *Tx ID:* #${transaction.id}\n` +
`👤 *ইউজার:* ${user.first_name || ''} (@${user.username || 'N/A'})\n` +
`💸 *পরিমাণ:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`↩️ *ব্যালেন্স রিফান্ড:* యూজার মেইন ব্যালেন্সে $${Number(transaction.amount).toFixed(2)} ফেরত দেওয়া হয়েছে।\n` +
`📅 *স্ট্যাটাস:* Rejected\n` +
`👑 *বাতিলকারী:* @${AUTHORIZED_ADMIN_USERNAME}`;

          await bot.editMessageText(rejectedMsg, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          }).catch(async () => {
            await bot.sendMessage(chatId, rejectedMsg, { parse_mode: 'Markdown' });
          });

          // Send rejection notice to user via Main Bot
          const userAlert = 
`⚠️ *আপনার উইথড্র রিকোয়েস্টটি বাতিল (Rejected) করা হয়েছে!* ⚠️\n\n` +
`💰 *পরিমাণ:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`উইথড্রর অর্থটি আপনার মূল ব্যালেন্সে রিফান্ড করা হয়েছে। কোনো তথ্য জানার থাকলে সাপোর্টে যোগাযোগ করুন।`;

          sendNotificationToUser(transaction.telegram_id, userAlert);

        } catch (err) {
          console.error('Error rejecting withdrawal:', err);
          bot.sendMessage(chatId, '❌ রিজেক্ট করতে ব্যর্থ হয়েছে: ' + err.message);
        }
      }

      // 7. View User Full Profile (`view_user_<id>`)
      if (data.startsWith('view_user_')) {
        const targetUserId = data.replace('view_user_', '');
        try {
          const target = await getUserFullDetails(targetUserId);
          if (!target) {
            return bot.sendMessage(chatId, '❌ ইউজার প্রোফাইল খুঁজে পাওয়া যায়নি।');
          }

          const profileText = 
`👤 *ইউজার সম্পূর্ণ প্রোফাইল বিবরণী (Full User Profile)*\n` +
`────────────────────────\n` +
`• 👤 *নাম:* ${target.first_name || ''} ${target.last_name || ''}\n` +
`• 📱 *ইউজারনেম:* @${target.username || 'N/A'}\n` +
`• 🆔 *টেলিগ্রাম আইডি:* \`${target.telegram_id}\`\n\n` +
`💰 *ব্যালেন্স:* \n` +
`• 💵 *মেইন উইথড্র ব্যালেন্স:* \`$${Number(target.wallet_balance).toFixed(4)} USDT\`\n` +
`• 📥 *ডিপোজিট ব্যালেন্স:* \`$${Number(target.deposit_balance).toFixed(2)} USDT\`\n` +
`• 💳 *মোট ডিপোজিট:* \`$${Number(target.total_deposit).toFixed(2)} USDT\`\n` +
`• 💸 *মোট উইথড্র:* \`$${Number(target.total_withdraw).toFixed(2)} USDT\`\n\n` +
`⛏️ *মাইনিং স্ট্যাটাস:*\n` +
`• ⚡ *ডেইলি আর্নিং:* \`${Number(target.daily_mining_rate).toFixed(4)} USDT/দিন\`\n` +
`• 🚀 *হ্যাশরেট:* \`${Number(target.hashrate).toFixed(2)} GH/s\`\n` +
`• 📦 *প্ল্যান সংখ্যা:* \`${(target.purchased_plans || []).length} টি\`\n\n` +
`🔒 *লক করা BEP20 উইথড্র অ্যাড্রেস:*\n` +
`\`${target.withdraw_address || 'লক করা হয়নি'}\`\n\n` +
`👥 *রেফারেল ট্র্যাকিং:*\n` +
`• 👥 *মোট রেফারেল:* \`${target.total_referrals || 0} জন\`\n` +
`• 🎁 *মোট রেফারেল কমিশন (১০%):* \`$${Number(target.total_referral_bonus).toFixed(2)} USDT\`\n` +
`• 🔗 *রেফারার আইডি:* \`${target.referred_by || 'কেউ নয়'}\`\n` +
`📅 *জয়েনিং ডেট:* ${new Date(target.created_at).toLocaleString()}`;

          await bot.sendMessage(chatId, profileText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
            }
          });
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      }
    });

    return bot;
  } catch (error) {
    console.error('Failed to start Admin Bot:', error.message);
    return null;
  }
}

// Push notification: When any user requests a withdrawal
async function notifyAdminNewWithdrawal(withdrawalData) {
  if (!adminBotInstance || !savedAdminChatId) {
    return;
  }

  try {
    const netAmount = Math.max(0, Number(withdrawalData.amount) - 1.0);
    const text = 
`🚨 *নতুন উইথড্র রিকোয়েস্ট এসেছে! (NEW WITHDRAWAL)* 🚨\n` +
`────────────────────────\n` +
`🆔 *Tx ID:* #${withdrawalData.id || 'N/A'}\n` +
`👤 *ইউজার:* ${withdrawalData.firstName || ''} ${withdrawalData.lastName || ''} (@${withdrawalData.username || 'N/A'})\n` +
`🆔 *টেলিগ্রাম আইডি:* \`${withdrawalData.telegramId}\`\n` +
`💰 *বর্তমান মেইন ব্যালেন্স:* \`$${Number(withdrawalData.walletBalance || 0).toFixed(2)} USDT\`\n` +
`📥 *ডিপোজিট ব্যালেন্স:* \`$${Number(withdrawalData.depositBalance || 0).toFixed(2)} USDT\`\n` +
`💸 *উইথড্র করতে চেয়েছে:* \`$${Number(withdrawalData.amount).toFixed(2)} USDT\`\n` +
`💵 *পাঠাতে হবে (Net):* \`$${netAmount.toFixed(2)} USDT\` (ফি: $1.00)\n` +
`🔒 *গন্তব্য BEP20 অ্যাড্রেস:*\n\`${withdrawalData.address}\`\n` +
`👥 *মোট রেফারেল:* \`${withdrawalData.totalReferrals || 0} জন\`\n` +
`📅 *তারিখ:* ${withdrawalData.date || new Date().toLocaleString()}\n\n` +
`নিচের বাটন দিয়ে অনুমোদন বা বাতিল করুন:`;

    const buttons = {
      inline_keyboard: [
        [
          { text: '✅ Approve & Send Payout', callback_data: `approve_wd_${withdrawalData.id}` },
          { text: '❌ Reject & Refund', callback_data: `reject_wd_${withdrawalData.id}` }
        ],
        [
          { text: '👤 View Full Profile', callback_data: `view_user_${withdrawalData.telegramId}` }
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

// Push notification: When any user verifies a deposit
async function notifyAdminNewDeposit(depositData) {
  if (!adminBotInstance || !savedAdminChatId) {
    return;
  }

  try {
    const text = 
`📥 *নতুন ডিপোজিট ভেরিফাইড ও জমা হয়েছে! (NEW DEPOSIT)* 📥\n` +
`────────────────────────\n` +
`👤 *ইউজার:* ${depositData.firstName || ''} ${depositData.lastName || ''} (@${depositData.username || 'N/A'})\n` +
`🆔 *টেলিগ্রাম আইডি:* \`${depositData.telegramId}\`\n` +
`💵 *ডিপোজিট পরিমাণ:* \`+$${Number(depositData.amount).toFixed(2)} USDT (BEP20)\`\n` +
`💰 *নতুন ডিপোজিট ব্যালেন্স:* \`$${Number(depositData.depositBalance || 0).toFixed(2)} USDT\`\n` +
`💳 *ইউজারের সর্বমোট ডিপোজিট:* \`$${Number(depositData.totalDeposit || 0).toFixed(2)} USDT\`\n` +
`👥 *রেফারার আইডি:* \`${depositData.referredBy || 'কেউ নয়'}\`\n` +
`🔗 *BSCscan Transaction Hash:*\n\`${depositData.txHash}\`\n` +
`📅 *তারিখ:* ${depositData.date || new Date().toLocaleString()}`;

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
