const TelegramBot = require('node-telegram-bot-api');
const {
  getOrCreateUser,
  getUserFullDetails,
  getBotGlobalStats,
  pool
} = require('./db');

let mainUserBotInstance = null;
let globalWebappUrl = '';
let botUsername = 'Meta_Farming_bot';

function sendNotificationToUser(telegramId, text, options = {}) {
  if (mainUserBotInstance && telegramId) {
    return mainUserBotInstance.sendMessage(telegramId, text, { parse_mode: 'Markdown', ...options })
      .catch(err => {
        // Fallback without parse_mode if Markdown parsing failed
        return mainUserBotInstance.sendMessage(telegramId, text, { ...options });
      });
  }
}

function sendPhotoToUser(telegramId, photo, caption = '', options = {}) {
  if (mainUserBotInstance && telegramId) {
    return mainUserBotInstance.sendPhoto(telegramId, photo, { caption, parse_mode: 'Markdown', ...options })
      .catch(err => {
        // Fallback without parse_mode if Markdown parsing failed
        return mainUserBotInstance.sendPhoto(telegramId, photo, { caption, ...options });
      });
  }
}

// 1. Notify user when mining reaches 0.01 USDT
function notifyUserClaimReady(telegramId, amount = '0.0100') {
  if (!mainUserBotInstance || !telegramId) return;
  const webappUrl = globalWebappUrl || process.env.WEBAPP_URL || 'http://localhost:3000';
  const text =
`⚡ *Claim Your Mining Bonus!* ⚡\n\n` +
`🎉 You have mined *${Number(amount).toFixed(4)} USDT*!\n` +
`Your mining bonus is ready to claim to your main balance.\n\n` +
`Tap below to claim now:`;

  return mainUserBotInstance.sendMessage(telegramId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Claim Now',
            web_app: { url: webappUrl }
          }
        ]
      ]
    }
  }).catch(err => console.error(`Error sending claim notification to ${telegramId}:`, err.message));
}

// 2. Notify user when 24 hours pass and mining stops
function notifyUserMiningStopped(telegramId) {
  if (!mainUserBotInstance || !telegramId) return;
  const webappUrl = globalWebappUrl || process.env.WEBAPP_URL || 'http://localhost:3000';
  const text =
`⏳ *Your Mining Has Stopped!* ⏳\n\n` +
`Your 24-hour mining cycle has ended.\n` +
`Please claim your daily earnings & start mining again to continue earning rewards!\n\n` +
`Tap below to start:`;

  return mainUserBotInstance.sendMessage(telegramId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '⚡ Start Mining',
            web_app: { url: webappUrl }
          }
        ]
      ]
    }
  }).catch(err => console.error(`Error sending 24h stopped notification to ${telegramId}:`, err.message));
}

// 3. Notify referrer when referred friend starts mining
function notifyReferrerInviteSuccess(referrerId, friendName = 'Friend') {
  if (!mainUserBotInstance || !referrerId) return;
  const webappUrl = globalWebappUrl || process.env.WEBAPP_URL || 'http://localhost:3000';
  const name = friendName || 'A new miner';
  const text =
`🎉 *Invite Success! Mining Boosted!* ⚡\n\n` +
`Your friend *${name}* just joined and started mining!\n` +
`✅ +1 Referral counted successfully.\n` +
`⚡ Your mining speed has been boosted!\n\n` +
`Invite more friends to multiply your daily earnings:`;

  const shareText = encodeURIComponent('⚡ Join Meta Farm to mine free USDT daily on Binance Smart Chain!');
  const shareUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=${referrerId}&text=${shareText}`;

  return mainUserBotInstance.sendMessage(referrerId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👥 Invite More', url: shareUrl }
        ],
        [
          { text: '🚀 Open Meta Farm', web_app: { url: webappUrl } }
        ]
      ]
    }
  }).catch(err => console.error(`Error sending invite success notification to ${referrerId}:`, err.message));
}

// 4. Notify user when withdrawal is submitted (instant bot SMS with 1-2 min wait & channel buttons)
function notifyUserWithdrawalSubmitted(telegramId, { amount, address, network = 'BEP20' } = {}) {
  if (!mainUserBotInstance || !telegramId) return;
  const payoutChannel = process.env.PAYOUT_CHANNEL_URL || 'https://t.me/Meta_Farming_Payment_Proof';
  const newsChannel = process.env.NEWS_CHANNEL_URL || 'https://t.me/metafarmingnews';

  const text =
`✅ *Your Withdraw Success!* ⚡\n\n` +
`Your withdrawal request has been submitted successfully.\n` +
`⏳ *Wait 1 theke 2 miniuts* for processing & verification.\n\n` +
`💰 *Amount:* \`$${Number(amount).toFixed(2)} USDT\`\n` +
`🔒 *Wallet Address:*\n\`${address}\`\n` +
`🌐 *Network:* ${network} (BNB Smart Chain)\n\n` +
`Join our official channels for real-time payment proofs & updates:`;

  return mainUserBotInstance.sendMessage(telegramId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💳 Payout Channel', url: payoutChannel },
          { text: '📢 News Channel', url: newsChannel }
        ]
      ]
    }
  }).catch(err => console.error(`Error sending withdraw submitted alert to ${telegramId}:`, err.message));
}

// 5. Notify user when withdrawal is approved and sent by admin (with BscScan & Payout channel buttons)
function notifyUserWithdrawalApproved(telegramId, { amount, address, payoutTxHash, tx_hash, network = 'BEP20' } = {}) {
  if (!mainUserBotInstance || !telegramId) return;
  const payoutChannel = process.env.PAYOUT_CHANNEL_URL || 'https://t.me/Meta_Farming_Payment_Proof';
  const txHash = payoutTxHash || tx_hash || '';
  const bscScanUrl = txHash ? `https://bscscan.com/tx/${txHash}` : `https://bscscan.com/address/${address}`;

  const text =
`🎉 *Withdraw Sent to Your Wallet!* 💸\n\n` +
`Your withdrawal has been successfully approved and sent to your wallet!\n\n` +
`💰 *Amount:* \`$${Number(amount).toFixed(2)} USDT\`\n` +
`🔒 *Wallet Address:*\n\`${address}\`\n` +
`🔗 *Transaction Hash:*\n\`${txHash}\`\n` +
`🌐 *Network:* ${network} (BNB Smart Chain)\n\n` +
`Status: *Completed* ✅`;

  return mainUserBotInstance.sendMessage(telegramId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔍 BscScan', url: bscScanUrl },
          { text: '💳 Payout Channel', url: payoutChannel }
        ]
      ]
    }
  }).catch(err => console.error(`Error sending withdraw approved alert to ${telegramId}:`, err.message));
}

// 7. Notify user when deposit is verified and credited (with BscScan button)
function notifyUserDepositCredited(telegramId, { amount, network = 'BEP20 (BSC)', txHash } = {}) {
  if (!mainUserBotInstance || !telegramId) return;
  const bscScanUrl = txHash ? `https://bscscan.com/tx/${txHash}` : 'https://bscscan.com';

  const text =
`✅ *Deposit Credited!* 💰\n\n` +
`Your deposit has been verified & credited to your account.\n\n` +
`💵 *Amount:* \`$${Number(amount).toFixed(2)} USDT\`\n` +
`🌐 *Network:* \`${network}\`\n` +
`⚡ *Status:* \`Completed\` ✅`;

  const buttons = {
    inline_keyboard: [
      [
        { text: '🔍 BscScan', url: bscScanUrl }
      ]
    ]
  };

  return mainUserBotInstance.sendMessage(telegramId, text, {
    parse_mode: 'Markdown',
    reply_markup: buttons
  }).catch(() => {
    return mainUserBotInstance.sendMessage(telegramId,
`✅ Deposit Credited!\n\nAmount: $${Number(amount).toFixed(2)} USDT\nNetwork: ${network}\nStatus: Completed ✅`, {
      reply_markup: buttons
    }).catch(err => console.error(`Error sending deposit credited alert to ${telegramId}:`, err.message));
  });
}

// 8. Notify referrer when referred member deposits
function notifyReferrerDepositBonus(referrerId, { bonus = 0.10, depositorName = 'Your referred user' } = {}) {
  if (!mainUserBotInstance || !referrerId) return;
  const text =
`🎁 *Referral Bonus Credited!* 💸\n\n` +
`Your referred member (${depositorName}) made a deposit!\n` +
`💰 *Referral Bonus:* \`+$${Number(bonus).toFixed(2)} USDT\`\n` +
`Credited directly to your main withdrawable balance.`;

  return mainUserBotInstance.sendMessage(referrerId, text, {
    parse_mode: 'Markdown'
  }).catch(err => console.error(`Error sending referral bonus alert to ${referrerId}:`, err.message));
}

// 6. Post Payment Receipt to Payment Proof Channel (e.g. @Meta_Farming_Payment_Proof)
async function postPaymentProofToChannel({ amount, toAddress, fromAddress, payoutTxHash, username, firstName, telegramId } = {}) {
  const channelId = process.env.PAYMENT_PROOF_CHANNEL || '@Meta_Farming_Payment_Proof';
  const botUser = botUsername || process.env.BOT_USERNAME || 'Meta_Farming_bot';

  const maskUser = () => {
    if (username) {
      const clean = username.replace('@', '').trim();
      if (clean.length > 4) {
        return `@${clean.slice(0, 2)}***${clean.slice(-2)}`;
      } else if (clean.length > 2) {
        return `@${clean.slice(0, 1)}***${clean.slice(-1)}`;
      }
      return `@${clean}***`;
    }
    if (firstName) {
      const clean = firstName.trim();
      if (clean.length > 3) {
        return `${clean.slice(0, 2)}***${clean.slice(-1)}`;
      }
      return `${clean}***`;
    }
    const tid = String(telegramId || '');
    return tid ? `ID: ${tid.slice(0, 2)}***${tid.slice(-2)}` : '@vi***88';
  };

  const shorten = (addr) => {
    if (!addr) return '0x0000...0000';
    const s = String(addr).trim();
    if (s.length <= 10) return s;
    return `${s.slice(0, 6)}...${s.slice(-4)}`;
  };

  const formattedAmount = Number(amount || 0).toFixed(4);

  const text =
`💎 META FARMING\n` +
`━━━━━━━━━━━━━━━━━━━━━━\n` +
`✦ PAYMENT RECEIPT✦ \n` +
`👤 Username: ${maskUser()}\n` +
`📤 Transaction Details\n` +
`💵 Amount: ${formattedAmount} USDT\n` +
`📥 From: ${shorten(fromAddress)}\n` +
`📤 Send To: ${shorten(toAddress)}\n` +
`🌐 Network: Binance Smart Chain (BEP-20)\n` +
`━━━━━━━━━━━━━━━━━━━━━━\n` +
`✅ Status: Funds Available`;

  const buttons = {
    inline_keyboard: [
      [
        { text: 'Official Bot ↗', url: `https://t.me/${botUser}` },
        { text: 'Bsc Transaction ↗', url: `https://bscscan.com/tx/${payoutTxHash || ''}` }
      ]
    ]
  };

  if (mainUserBotInstance) {
    try {
      await mainUserBotInstance.sendMessage(channelId, text, {
        reply_markup: buttons
      });
      console.log(`✅ [Payment Proof] Successfully posted to ${channelId} via Main Bot`);
      return { success: true, bot: 'main', text, buttons, channelId };
    } catch (err) {
      console.warn(`[Payment Proof] Main bot could not post to ${channelId}:`, err.message);
    }
  }

  return { success: false, text, buttons, channelId };
}

function getMainBotInstance() {
  return mainUserBotInstance;
}

function initTelegramBot(webappUrl) {
  globalWebappUrl = webappUrl;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.log('----------------------------------------------------');
    console.log('ℹ️  TELEGRAM_BOT_TOKEN is not configured.');
    console.log('   The WebApp is available in your browser at: ' + webappUrl);
    console.log('   To connect with Telegram, add your Bot Token in .env');
    console.log('----------------------------------------------------');
    return null;
  }

  try {
    const bot = new TelegramBot(token, { polling: true });
    mainUserBotInstance = bot;
    console.log('🚀 Telegram Bot is running in polling mode with Neon DB integration...');

    botUsername = 'Meta_Farming_bot';
    bot.getMe().then(me => {
      if (me && me.username) {
        botUsername = me.username;
        console.log(`🤖 Bot @${botUsername} connected successfully.`);
      }
    }).catch(err => console.log('Notice fetching bot info:', err.message));

    // Set Menu Button to open Mini App directly
    bot.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🚀 Open Meta Farm',
        web_app: { url: webappUrl }
      }
    }).catch(err => console.log('Notice: Could not set default menu button:', err.message));

    // Supported Languages (Excluding Bengali as requested: "bangla bade all sob thakbe flag soho")
    const BOT_LANGUAGES = [
      { code: 'en', label: '🇬🇧 English', name: 'English' },
      { code: 'ru', label: '🇷🇺 Русский', name: 'Russian' },
      { code: 'id', label: '🇮🇩 Bahasa Indonesia', name: 'Indonesian' },
      { code: 'ng', label: '🇳🇬 English (NG)', name: 'Nigerian' },
      { code: 'hi', label: '🇮🇳 हिन्दी', name: 'Hindi' },
      { code: 'vi', label: '🇻🇳 Tiếng Việt', name: 'Vietnamese' },
      { code: 'fil', label: '🇵🇭 Tagalog', name: 'Filipino' },
      { code: 'tr', label: '🇹🇷 Türkçe', name: 'Turkish' },
      { code: 'es', label: '🇪🇸 Español', name: 'Spanish' }
    ];

    // Welcome messages by language
    const WELCOME_MESSAGES = {
      en: `⚡ *Welcome to Meta Farm!* ⚡\n\nStart automated cloud mining USDT on Binance Smart Chain and receive daily rewards directly to your account.`,
      ru: `⚡ *Добро пожаловать в Meta Farm!* ⚡\n\nНачните облачный майнинг USDT и получайте ежедневные награды прямо на свой счет.`,
      id: `⚡ *Selamat Datang di Meta Farm!* ⚡\n\nMulailah cloud mining USDT dan dapatkan penghasilan harian otomatis ke akun Anda.`,
      ng: `⚡ *Welcome to Meta Farm!* ⚡\n\nStart your USDT cloud mining sharp sharp and collect your daily rewards directly!`,
      hi: `⚡ *Meta Farm में आपका स्वागत है!* ⚡\n\nUSDT क्लाउड माइनिंग शुरू करें और प्रतिदिन सीधे अपने खाते में कमाई प्राप्त करें।`,
      vi: `⚡ *Chào mừng bạn đến với Meta Farm!* ⚡\n\nBắt đầu khai thác đám mây USDT và nhận phần thưởng hàng ngày vào tài khoản của bạn.`,
      fil: `⚡ *Maligayang pagdating sa Meta Farm!* ⚡\n\nSimulan ang pagmimina ng USDT at kumita ng pang-araw-araw na pabuya diretso sa iyong account.`,
      tr: `⚡ *Meta Farm'a Hoş Geldiniz!* ⚡\n\nUSDT bulut madenciliğine başlayın ve günlük kazançlarınızı doğrudan hesabınıza alın.`,
      es: `⚡ *¡Bienvenido a Meta Farm!* ⚡\n\nComience la minería en la nube de USDT y obtenga recompensas diarias directamente en su cuenta.`
    };

    // Helper: Build the 3 Action Buttons requested
    const getWelcomeActionKeyboard = () => ({
      inline_keyboard: [
        [
          {
            text: '🚀 Open Meta Farm',
            web_app: { url: webappUrl }
          }
        ],
        [
          {
            text: '📢 Join News Channel',
            url: 'https://t.me/metafarmingnews'
          }
        ],
        [
          {
            text: '💳 Payout Channel',
            url: 'https://t.me/Meta_Farming_Payment_Proof'
          }
        ]
      ]
    });

    // /start command: Record User & Referral, then ask to Select Language
    bot.onText(/\/start(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const tgUser = msg.from || {};
      const refCode = match[1] ? match[1].trim() : '';

      try {
        // Save or update user in Neon PostgreSQL Database and track referral
        await getOrCreateUser({
          id: tgUser.id || chatId,
          first_name: tgUser.first_name || 'Miner',
          last_name: tgUser.last_name || '',
          username: tgUser.username || '',
          refCode
        });

        // Language selection keyboard (2 per row)
        const languageButtons = [];
        for (let i = 0; i < BOT_LANGUAGES.length; i += 2) {
          const row = [
            { text: BOT_LANGUAGES[i].label, callback_data: `lang_${BOT_LANGUAGES[i].code}` }
          ];
          if (BOT_LANGUAGES[i + 1]) {
            row.push({ text: BOT_LANGUAGES[i + 1].label, callback_data: `lang_${BOT_LANGUAGES[i + 1].code}` });
          }
          languageButtons.push(row);
        }

        const langPrompt = `🌐 *Please select your language:*`;

        await bot.sendMessage(chatId, langPrompt, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: languageButtons
          }
        });
      } catch (error) {
        console.error('Bot /start error:', error);
        bot.sendMessage(chatId, `🌐 *Please select your language:*`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🇬🇧 English', callback_data: 'lang_en' }]
            ]
          }
        });
      }
    });

    // Handle Inline Callbacks
    bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data || '';

      bot.answerCallbackQuery(query.id).catch(() => {});

      // 1. When user selects a language: Send Welcome SMS + 3 Buttons ONLY
      if (data.startsWith('lang_')) {
        const langCode = data.replace('lang_', '');
        const welcomeText = WELCOME_MESSAGES[langCode] || WELCOME_MESSAGES.en;

        try {
          // Delete or edit language selection message, then show Welcome message
          await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        } catch {}

        await bot.sendMessage(chatId, welcomeText, {
          parse_mode: 'Markdown',
          reply_markup: getWelcomeActionKeyboard()
        });
        return;
      }

      // Existing callbacks if triggered
      if (data === 'my_account') {
        return sendUserAccountInfo(chatId, userId);
      } else if (data === 'my_history') {
        return sendUserHistory(chatId, userId);
      } else if (data === 'bot_stats') {
        return sendGlobalStats(chatId);
      }
    });

    // Helper: Show User Account Details (if typed directly via /account or /profile)
    async function sendUserAccountInfo(chatId, userId) {
      try {
        const user = await getUserFullDetails(userId);
        if (!user) {
          return bot.sendMessage(chatId, 'User not found. Please type /start.');
        }

        const addressInfo = user.withdraw_address 
          ? `\`${user.withdraw_address}\` (🔒 Locked)`
          : 'Not set yet (Locks permanently on first withdrawal)';

        const refLink = `https://t.me/${botUsername}?start=${user.telegram_id}`;

        const text = 
`👤 *Account Details:*\n\n` +
`• *Name:* ${user.first_name || ''} ${user.last_name || ''} (@${user.username || 'N/A'})\n` +
`• *Telegram ID:* \`${user.telegram_id}\`\n\n` +
`💰 *Balances:*\n` +
`• *Withdrawable Balance (Main):* \`${Number(user.wallet_balance).toFixed(4)} USDT\`\n` +
`• *Deposit Balance:* \`${Number(user.deposit_balance).toFixed(2)} USDT\`\n` +
`• *Total Deposited:* \`${Number(user.total_deposit).toFixed(2)} USDT\`\n` +
`• *Total Withdrawn:* \`${Number(user.total_withdraw).toFixed(2)} USDT\`\n\n` +
`⛏️ *Mining:*\n` +
`• *Daily Mining Rate:* \`${Number(user.daily_mining_rate).toFixed(4)} USDT/day\`\n` +
`• *Hashrate:* \`${Number(user.hashrate).toFixed(2)} GH/s\`\n\n` +
`🔒 *Withdraw Address (BEP20):*\n` +
`• ${addressInfo}\n\n` +
`👥 *Referral:* \`${user.total_referrals || 0} users\`\n` +
`• *Referral Bonus (10%):* \`${Number(user.total_referral_bonus).toFixed(2)} USDT\`\n` +
`• *Your Link:*\n\`${refLink}\``;

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: getWelcomeActionKeyboard()
        });
      } catch (err) {
        console.error('Error in sendUserAccountInfo:', err);
      }
    }

    // Helper: Show User Transaction History
    async function sendUserHistory(chatId, userId) {
      try {
        const user = await getUserFullDetails(userId);
        if (!user || !user.transactions || user.transactions.length === 0) {
          return bot.sendMessage(chatId, 'No transaction history found yet.', {
            reply_markup: getWelcomeActionKeyboard()
          });
        }

        let text = `📜 *Transaction History:*\n\n`;

        user.transactions.slice(0, 8).forEach((tx, idx) => {
          const typeIcon = tx.type === 'deposit' ? '📥 Deposit' :
                           tx.type === 'withdraw' ? '📤 Withdraw' :
                           tx.type === 'plan_purchase' ? '📦 Plan Purchase' :
                           tx.type === 'claim' ? '⚡ Mining Claim' : '🎁 Referral Bonus';
          
          const statusIcon = tx.status === 'Pending' ? '⏳ Pending' : '✅ Completed';
          const amtStr = `${Number(tx.amount).toFixed(2)} USDT`;
          const time = new Date(tx.created_at).toLocaleString('en-US', { hour12: true, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

          text += `*${idx + 1}. ${typeIcon}* — \`${amtStr}\`\n`;
          text += `   • Status: ${statusIcon}\n`;
          if (tx.tx_hash) {
            text += `   • TxID: \`${tx.tx_hash.substring(0, 10)}...${tx.tx_hash.substring(tx.tx_hash.length - 6)}\`\n`;
          }
          text += `   • Date: ${time}\n\n`;
        });

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: getWelcomeActionKeyboard()
        });
      } catch (err) {
        console.error('Error in sendUserHistory:', err);
      }
    }

    // Helper: Show Global Bot Stats
    async function sendGlobalStats(chatId) {
      try {
        const stats = await getBotGlobalStats();

        const text = 
`🌐 *Bot Global Live Statistics (Neon PostgreSQL):*\n\n` +
`• 👥 *Total Users:* \`${stats.total_users || 0}\`\n` +
`• 💰 *Total User Balance:* \`${Number(stats.total_user_wallet_balance || 0).toFixed(2)} USDT\`\n` +
`• 📥 *Total Deposit Balance:* \`${Number(stats.total_user_deposit_balance || 0).toFixed(2)} USDT\`\n` +
`• 💳 *Total Bot Deposit:* \`${Number(stats.total_bot_deposit || 0).toFixed(2)} USDT\`\n` +
`• 💸 *Total Bot Withdraw:* \`${Number(stats.total_bot_withdraw || 0).toFixed(2)} USDT\`\n` +
`• ⏳ *Pending Withdrawals:* \`${stats.pending_withdrawals_count || 0}\`\n` +
`• 🎁 *Total 10% Referral Commissions Paid:* \`${Number(stats.total_referral_commissions || 0).toFixed(2)} USDT\``;

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: getWelcomeActionKeyboard()
        });
      } catch (err) {
        console.error('Error in sendGlobalStats:', err);
      }
    }

    // Direct text commands
    bot.on('message', async (msg) => {
      const text = msg.text || '';
      const chatId = msg.chat.id;
      const userId = msg.from ? msg.from.id : chatId;

      if (text.startsWith('/start')) {
        // Handled by onText(/\/start(.*)/)
        return;
      }

      if (text === '/account' || text === '/profile' || text === '/balance') {
        return sendUserAccountInfo(chatId, userId);
      }

      if (text === '/history') {
        return sendUserHistory(chatId, userId);
      }

      if (text === '/stats' || text === '/admin' || text === '/global') {
        return sendGlobalStats(chatId);
      }
    });

    return bot;
  } catch (error) {
    console.error('Failed to start Telegram Bot:', error.message);
    return null;
  }
}

module.exports = {
  initTelegramBot,
  sendNotificationToUser,
  sendPhotoToUser,
  notifyUserClaimReady,
  notifyUserMiningStopped,
  notifyReferrerInviteSuccess,
  notifyUserWithdrawalSubmitted,
  notifyUserWithdrawalApproved,
  notifyUserDepositCredited,
  notifyReferrerDepositBonus,
  postPaymentProofToChannel,
  getMainBotInstance
};
