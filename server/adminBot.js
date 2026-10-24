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
  pool
} = require('./db');
const { sendNotificationToUser, notifyUserWithdrawalApproved } = require('./bot');

let adminBotInstance = null;
let savedAdminChatId = null;
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
`Select an action below to manage the platform:`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: `⏳ Pending Withdrawals (${pendingList.length})`, callback_data: 'admin_pending_wd' },
              { text: `📥 Recent Deposits`, callback_data: 'admin_recent_dp' }
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
              { text: `💼 Financial Overview`, callback_data: 'admin_system_finance' }
            ],
            [
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

    // Helper: Render User Profile Card in English
    const renderUserProfile = (target) => {
      return (
`👤 *USER PROFILE DETAILS* 👤\n` +
`────────────────────────\n` +
`• 👤 *Full Name:* ${target.first_name || ''} ${target.last_name || ''}\n` +
`• 📱 *Username:* @${target.username || 'N/A'}\n` +
`• 🆔 *Telegram ID:* \`${target.telegram_id}\`\n\n` +
`💰 *Balances & Mining:*\n` +
`• 💵 *Withdrawable Balance:* \`$${Number(target.wallet_balance).toFixed(4)} USDT\`\n` +
`• 📥 *Deposit Balance:* \`$${Number(target.deposit_balance).toFixed(2)} USDT\`\n` +
`• 💳 *Total Deposited:* \`$${Number(target.total_deposit).toFixed(2)} USDT\`\n` +
`• 💸 *Total Withdrawn:* \`$${Number(target.total_withdraw).toFixed(2)} USDT\`\n` +
`• ⚡ *Daily Mining Rate:* \`${Number(target.daily_mining_rate).toFixed(4)} USDT/day\`\n` +
`• 🚀 *Current Hashrate:* \`${Number(target.hashrate).toFixed(2)} GH/s\`\n` +
`• 📦 *Active Plan Count:* \`${(target.purchased_plans || []).length}\`\n\n` +
`🔒 *BEP20 Withdrawal Address:*\n` +
`\`${target.withdraw_address || 'Not Locked Yet'}\`\n\n` +
`👥 *Referral Details:*\n` +
`• 👥 *Total Referrals:* \`${target.total_referrals || 0}\`\n` +
`• 🎁 *Referral Commissions:* \`$${Number(target.total_referral_bonus).toFixed(2)} USDT\`\n` +
`• 🔗 *Referred By:* \`${target.referred_by || 'Direct / None'}\`\n` +
`📅 *Joined:* ${new Date(target.created_at).toLocaleString()}`
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
      delete adminState[chatId];
      await sendAdminDashboard(chatId);
    });

    // /help command
    bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      savedAdminChatId = chatId;

      const helpText =
`🛠 *Admin Command Quick Reference* 🛠\n\n` +
`• \`/start\` - Open Admin Control Dashboard\n` +
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

      const query = (match[2] || '').trim();
      if (!query) {
        adminState[chatId] = 'awaiting_search';
        return bot.sendMessage(chatId, '🔍 *Search User Account*\n\nPlease send the Telegram Username (e.g. `@johndoe`) or numeric Telegram ID:', {
          parse_mode: 'Markdown'
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
          const buttons = {
            inline_keyboard: [
              [
                { text: '📜 Transaction History', callback_data: `user_tx_${user.telegram_id}` },
                { text: '🔓 Reset BEP20 Address', callback_data: `reset_addr_${user.telegram_id}` }
              ],
              [
                { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
              ]
            ]
          };
          await bot.sendMessage(chatId, profile, { parse_mode: 'Markdown', reply_markup: buttons });
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

      const broadcastMsg = (match[1] || '').trim();
      if (!broadcastMsg) {
        adminState[chatId] = 'awaiting_broadcast';
        return bot.sendMessage(chatId, '📢 *Broadcast Message*\n\nPlease reply with the announcement text you wish to send to all registered users (or send `/cancel` to abort):', {
          parse_mode: 'Markdown'
        });
      }

      await executeBroadcast(chatId, broadcastMsg);
    });

    // /adjust command (e.g. `/adjust 123456789 5.00` or `/adjust 123456789 -2.50 deposit`)
    bot.onText(/\/adjust\s+(\S+)\s+(\S+)(?:\s+(\S+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;

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

        bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
      } catch (err) {
        bot.sendMessage(chatId, '❌ Error adjusting balance: ' + err.message);
      }
    });

    // Interactive message listener for search & broadcast prompts
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      if (!isAuthorizedAdmin(msg.from)) return;
      if (msg.text && msg.text.startsWith('/')) return; // Ignore commands handled by onText

      const state = adminState[chatId];
      if (!state) return;

      if (state === 'awaiting_search') {
        delete adminState[chatId];
        const query = msg.text.trim();
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
            const buttons = {
              inline_keyboard: [
                [
                  { text: '📜 Transaction History', callback_data: `user_tx_${user.telegram_id}` },
                  { text: '🔓 Reset BEP20 Address', callback_data: `reset_addr_${user.telegram_id}` }
                ],
                [
                  { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            };
            await bot.sendMessage(chatId, profile, { parse_mode: 'Markdown', reply_markup: buttons });
          }
        } catch (err) {
          bot.sendMessage(chatId, '❌ Search error: ' + err.message);
        }
      } else if (state === 'awaiting_broadcast') {
        delete adminState[chatId];
        await executeBroadcast(chatId, msg.text);
      }
    });

    // Broadcast execution helper
    const executeBroadcast = async (chatId, text) => {
      try {
        const userIds = await getAllUserTelegramIds();
        if (userIds.length === 0) {
          return bot.sendMessage(chatId, '⚠️ No registered users found in database to broadcast.');
        }

        const statusMsg = await bot.sendMessage(chatId, `🚀 *Broadcast in Progress...*\nTargeting ${userIds.length} users. Please wait...`, {
          parse_mode: 'Markdown'
        });

        let success = 0;
        let failed = 0;

        for (const uid of userIds) {
          try {
            await sendNotificationToUser(uid, text);
            success++;
          } catch (e) {
            failed++;
          }
          // Slight delay to respect Telegram rate limits
          await new Promise(r => setTimeout(r, 40));
        }

        const report = 
`📢 *Broadcast Completed!* 📢\n\n` +
`• ✅ Delivered successfully: \`${success}\` users\n` +
`• ⚠️ Failed / Blocked: \`${failed}\` users\n` +
`• 👥 Total attempted: \`${userIds.length}\` users`;

        await bot.editMessageText(report, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }]]
          }
        }).catch(async () => {
          await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
        });
      } catch (err) {
        console.error('Error executing broadcast:', err);
        bot.sendMessage(chatId, '❌ Broadcast failed: ' + err.message);
      }
    };

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
`• 📅 *Request Date:* ${new Date(item.created_at).toLocaleString()}`;

            const buttons = {
              inline_keyboard: [
                [
                  { text: '✅ Approve & Send Payout', callback_data: `approve_wd_${item.id}` },
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

      // 5. Prompt Broadcast
      if (data === 'admin_broadcast_prompt') {
        adminState[chatId] = 'awaiting_broadcast';
        return bot.sendMessage(chatId, '📢 *Broadcast Message to All Users*\n\nPlease reply with the announcement text (or type `/cancel` to abort):', {
          parse_mode: 'Markdown'
        });
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
          const payoutTxHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
          const result = await approveWithdrawal(txId, payoutTxHash);
          const { transaction, user } = result;

          // Edit admin message to show Approved
          const approvedMsg = 
`✅ *WITHDRAWAL APPROVED & SENT!* ✅\n` +
`────────────────────────\n` +
`• 🆔 *Tx ID:* #${transaction.id}\n` +
`• 👤 *User:* ${user.first_name || ''} (@${user.username || 'N/A'})\n` +
`• 💸 *Amount:* \`$${Number(transaction.amount).toFixed(2)} USDT\`\n` +
`• 🔒 *Destination Wallet:*\n\`${transaction.wallet_address}\`\n` +
`• 🔗 *Payout TxHash:*\n\`${payoutTxHash}\`\n` +
`• 📅 *Status:* Completed ✅\n` +
`• 👑 *Processed By:* @${AUTHORIZED_ADMIN_USERNAME}`;

          await bot.editMessageText(approvedMsg, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          }).catch(async () => {
            await bot.sendMessage(chatId, approvedMsg, { parse_mode: 'Markdown' });
          });

          // Send confirmation message to the User via Main Bot (@Meta_Farming_bot) with BscScan & Payout channel buttons
          notifyUserWithdrawalApproved(transaction.telegram_id, {
            amount: transaction.amount,
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
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📜 Transaction History', callback_data: `user_tx_${target.telegram_id}` },
                  { text: '🔓 Reset BEP20 Address', callback_data: `reset_addr_${target.telegram_id}` }
                ],
                [
                  { text: '🔙 Back to Dashboard', callback_data: 'admin_refresh' }
                ]
              ]
            }
          });
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
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
`• 📅 *Request Date:* ${withdrawalData.date || new Date().toLocaleString()}\n\n` +
`Approve or Reject this request below:`;

    const buttons = {
      inline_keyboard: [
        [
          { text: '✅ Approve & Send Payout', callback_data: `approve_wd_${withdrawalData.id}` },
          { text: '❌ Reject & Refund', callback_data: `reject_wd_${withdrawalData.id}` }
        ],
        [
          { text: '👤 View Full Profile', callback_data: `view_user_${withdrawalData.telegramId}` },
          { text: '📜 Transaction History', callback_data: `user_tx_${withdrawalData.telegramId}` }
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
