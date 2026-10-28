const TelegramBot = require('node-telegram-bot-api');
const {
  getOrCreateUser,
  getUserFullDetails,
  getBotGlobalStats,
  startUserMining,
  claimMinedReward,
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
            text: '⚡ Claim in Bot',
            callback_data: 'bot_claim'
          },
          {
            text: '🚀 Open App',
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
            text: '⚡ Claim & Start Mining',
            callback_data: 'bot_start_mining'
          },
          {
            text: '🚀 Open App',
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
`⏳ *Wait 1 to 2 minutes* for processing & verification.\n\n` +
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

    bot.on('polling_error', (error) => {
      if (error.code === 'ETELEGRAM' && String(error.message).includes('409')) {
        return; // rolling restart handover
      }
      console.warn(`[UserBot Polling] ${error.message || error}`);
    });

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

    // Supported Languages (9 global languages excluding Bengali)
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

    // /start command: High-throughput concurrent handler for 100k daily users
    bot.onText(/\/start(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const tgUser = msg.from || {};
      const refCode = match[1] ? match[1].trim() : '';

      try {
        // Kick off user persistence asynchronously via single-roundtrip UPSERT
        const syncPromise = getOrCreateUser({
          id: tgUser.id || chatId,
          first_name: tgUser.first_name || 'Miner',
          last_name: tgUser.last_name || '',
          username: tgUser.username || '',
          refCode
        }).catch(err => {
          console.warn('Async user sync notice on /start:', err.message);
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

        // Ensure user sync doesn't block Telegram UI response even during high traffic
        await Promise.race([
          syncPromise,
          new Promise(r => setTimeout(r, 1200))
        ]);

        await bot.sendMessage(chatId, langPrompt, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: languageButtons
          }
        });
      } catch (error) {
        console.error('Bot /start error:', error.message);
        bot.sendMessage(chatId, `🌐 *Please select your language:*`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🇬🇧 English', callback_data: 'lang_en' }]
            ]
          }
        }).catch(() => {});
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

      // Callbacks for Account, History, Mining, Referrals, and Stats
      if (data === 'my_account') {
        return sendUserAccountInfo(chatId, userId);
      } else if (data === 'my_referrals') {
        return sendUserReferralInfo(chatId, userId);
      } else if (data === 'my_mining') {
        return sendUserMiningInfo(chatId, userId);
      } else if (data === 'my_history') {
        return sendUserHistory(chatId, userId);
      } else if (data === 'bot_stats') {
        return sendGlobalStats(chatId);
      } else if (data === 'bot_claim') {
        return handleBotClaim(chatId, userId);
      } else if (data === 'bot_start_mining') {
        return handleBotStartMining(chatId, userId);
      }
    });

    // Helper: Direct Claim Handler for Bot
    async function handleBotClaim(chatId, userId) {
      try {
        const user = await getUserFullDetails(userId);
        if (!user) {
          return bot.sendMessage(chatId, 'User not found. Please type /start.');
        }

        try {
          const updatedUser = await claimMinedReward(userId, 0, false);
          const claimedAmount = Number(updatedUser.claimed_amount || 0);
          const newBalance = Number(updatedUser.wallet_balance || 0).toFixed(4);
          const isStillMining = Boolean(updatedUser.is_mining_active);

          const statusMsg = isStillMining
            ? '🟢 *Mining is still active* and generating more rewards!'
            : '⏳ *24h Mining Cycle Complete.* Click below to start a new cycle!';

          const text =
`🎉 *Mining Bonus Claimed Successfully!* 💰\n\n` +
`✅ *+${claimedAmount.toFixed(4)} USDT* has been credited directly to your Main Balance!\n\n` +
`💰 *New Main Balance (Withdrawable):* \`${newBalance} USDT\`\n` +
`${statusMsg}\n\n` +
`Share your referral link or deposit to upgrade your daily mining speed!`;

          const buttons = [
            [
              { text: '🚀 Open Meta Farm', web_app: { url: globalWebappUrl || 'http://localhost:3000' } }
            ]
          ];

          if (!isStillMining) {
            buttons.push([
              { text: '⚡ Start Next Mining Cycle', callback_data: 'bot_start_mining' },
              { text: '💰 My Balance', callback_data: 'my_account' }
            ]);
          } else {
            buttons.push([
              { text: '⛏️ Mining Status', callback_data: 'my_mining' },
              { text: '💰 My Balance', callback_data: 'my_account' }
            ]);
          }

          return bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
          });
        } catch (claimErr) {
          const currentMined = Number(user.live_mined_unclaimed || user.mined_unclaimed || 0).toFixed(6);
          const dailyRate = Number(user.daily_mining_rate || 0.05).toFixed(4);
          const isMining = user.is_mining_active && user.mining_started_at;

          let advice = '';
          const buttons = [
            [
              { text: '🚀 Open Meta Farm', web_app: { url: globalWebappUrl || 'http://localhost:3000' } }
            ]
          ];

          if (!isMining) {
            advice = `Mining is currently stopped. Click *⚡ Start Mining* below to begin earning!`;
            buttons.push([
              { text: '⚡ Start Mining Now', callback_data: 'bot_start_mining' },
              { text: '💰 My Balance', callback_data: 'my_account' }
            ]);
          } else {
            advice = `Your cloud miner is running actively! Earnings accrue in real-time.\n• *Daily Rate:* \`${dailyRate} USDT/day\`\n• *Unclaimed Now:* \`${currentMined} USDT\``;
            buttons.push([
              { text: '⛏️ Mining Status', callback_data: 'my_mining' },
              { text: '💰 My Balance', callback_data: 'my_account' }
            ]);
          }

          const text =
`ℹ️ *No Mining Rewards to Claim Yet*\n\n` +
`${advice}\n\n` +
`Your mining bonus will be available to claim as soon as it accrues!`;

          return bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
          });
        }
      } catch (err) {
        console.error('Error in handleBotClaim:', err);
        return bot.sendMessage(chatId, 'An error occurred while processing your claim. Please try again.');
      }
    }

    // Helper: Direct Start Mining Handler for Bot
    async function handleBotStartMining(chatId, userId) {
      try {
        const user = await getUserFullDetails(userId);
        if (!user) {
          return bot.sendMessage(chatId, 'User not found. Please type /start.');
        }

        const now = Date.now();
        const SESSION_MS = 24 * 60 * 60 * 1000;
        const startTime = user.mining_started_at ? new Date(user.mining_started_at).getTime() : 0;
        const isMining = user.is_mining_active && startTime && (now - startTime < SESSION_MS);

        if (isMining) {
          const remMs = SESSION_MS - (now - startTime);
          const remHours = Math.floor(remMs / (3600 * 1000));
          const remMins = Math.floor(((remMs % (3600 * 1000)) / (60 * 1000));
          const unclaimed = Number(user.live_mined_unclaimed || user.mined_unclaimed || 0).toFixed(6);

          const text =
`⚡ *Mining is Already Active!* ⛏️\n\n` +
`• *Time Remaining:* \`${remHours}h ${remMins}m\`\n` +
`• *Unclaimed Bonus:* \`${unclaimed} USDT\`\n` +
`• *Daily Mining Rate:* \`${Number(user.daily_mining_rate || 0.05).toFixed(4)} USDT/day\`\n\n` +
`You can claim your mined bonus to your main balance anytime!`;

          return bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '⚡ Claim Bonus Now', callback_data: 'bot_claim' },
                  { text: '🚀 Open App', web_app: { url: globalWebappUrl || 'http://localhost:3000' } }
                ],
                [
                  { text: '💰 My Balance', callback_data: 'my_account' }
                ]
              ]
            }
          });
        }

        // Start mining cycle & credit any uncollected from previous session
        const { user: updatedUser, activatedReferrerId, referredUser } = await startUserMining(userId);

        if (activatedReferrerId) {
          const friendName = (referredUser?.first_name || referredUser?.username || 'Friend').trim();
          notifyReferrerInviteSuccess(activatedReferrerId, friendName);
        }

        const fullUser = await getUserFullDetails(userId);
        const text =
`🚀 *24-Hour Mining Cycle Started!* ⛏️\n\n` +
`Your USDT cloud miner is now actively generating earnings on Binance Smart Chain!\n\n` +
`• *Cycle Duration:* 24 Hours\n` +
`• *Daily Rate:* \`${Number(fullUser.daily_mining_rate || 0.05).toFixed(4)} USDT/day\`\n` +
`• *Hashrate:* \`${Number(fullUser.hashrate || 1.22).toFixed(2)} GH/s\`\n` +
`• *Main Balance:* \`${Number(fullUser.wallet_balance || 0).toFixed(4)} USDT\`\n\n` +
`Claim your bonus anytime in this bot or in the Mini App!`;

        return bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🚀 Open Meta Farm', web_app: { url: globalWebappUrl || 'http://localhost:3000' } }
              ],
              [
                { text: '⚡ Claim Mining Reward', callback_data: 'bot_claim' },
                { text: '💰 My Balance', callback_data: 'my_account' }
              ]
            ]
          }
        });
      } catch (err) {
        console.error('Error in handleBotStartMining:', err);
        return bot.sendMessage(chatId, 'Failed to start mining. Please try again or open the app.');
      }
    }

    // Helper: Show User Account Details
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

        const isMining = user.is_mining_active && user.mining_started_at;
        let miningStatusText = '🔴 Inactive (Mining is stopped)';
        if (isMining) {
          const now = Date.now();
          const startTime = new Date(user.mining_started_at).getTime();
          const elapsed = now - startTime;
          const SESSION_MS = 24 * 60 * 60 * 1000;
          if (elapsed < SESSION_MS) {
            const remHours = Math.floor((SESSION_MS - elapsed) / (3600 * 1000));
            const remMins = Math.floor(((SESSION_MS - elapsed) % (3600 * 1000)) / (60 * 1000));
            miningStatusText = `🟢 Active (${remHours}h ${remMins}m remaining)`;
          } else {
            miningStatusText = `⏳ 24h Cycle Complete (Ready to Claim)`;
          }
        }

        const unclaimedBonus = Number(user.live_mined_unclaimed || user.mined_unclaimed || 0).toFixed(6);

        const text = 
`👤 *Account Details & Balance:*\n\n` +
`• *Name:* ${user.first_name || ''} ${user.last_name || ''} (@${user.username || 'N/A'})\n` +
`• *Telegram ID:* \`${user.telegram_id}\`\n\n` +
`💰 *Account Balances:*\n` +
`• *Withdrawable Balance (Main):* \`${Number(user.wallet_balance).toFixed(4)} USDT\`\n` +
`• *Deposit Balance:* \`${Number(user.deposit_balance).toFixed(2)} USDT\`\n` +
`• *Total Deposited:* \`${Number(user.total_deposit).toFixed(2)} USDT\`\n` +
`• *Total Withdrawn:* \`${Number(user.total_withdraw).toFixed(2)} USDT\`\n\n` +
`⛏️ *Mining:*\n` +
`• *Status:* ${miningStatusText}\n` +
`• *Mined Bonus (Unclaimed):* \`${unclaimedBonus} USDT\`\n` +
`• *Daily Mining Rate:* \`${Number(user.daily_mining_rate).toFixed(4)} USDT/day\`\n` +
`• *Hashrate:* \`${Number(user.hashrate).toFixed(2)} GH/s\`\n\n` +
`🔒 *Withdraw Address (BEP20):*\n` +
`• ${addressInfo}\n\n` +
`👥 *Referrals:* \`${(user.referrals && user.referrals.length) ? user.referrals.length : (user.total_referrals || 0)} users\`\n` +
`• *Referral Bonus (10%):* \`${Number(user.total_referral_bonus).toFixed(2)} USDT\`\n` +
`• *Your Invite Link:*\n\`${refLink}\``;

        const webappUrl = globalWebappUrl || 'http://localhost:3000';
        const accountButtons = [
          [
            { text: '🚀 Open Meta Farm', web_app: { url: webappUrl } }
          ]
        ];

        if (Number(unclaimedBonus) >= 0.0001) {
          accountButtons.push([
            { text: `⚡ Claim Mined Bonus (${unclaimedBonus} USDT)`, callback_data: 'bot_claim' }
          ]);
        }

        accountButtons.push(
          [
            { text: '⛏️ Mining Status', callback_data: 'my_mining' },
            { text: '👥 My Referrals', callback_data: 'my_referrals' }
          ],
          [
            { text: '📜 History', callback_data: 'my_history' },
            { text: '🌐 Bot Stats', callback_data: 'bot_stats' }
          ]
        );

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: accountButtons
          }
        });
      } catch (err) {
        console.error('Error in sendUserAccountInfo:', err);
      }
    }

    // Helper: Show User Referral Details
    async function sendUserReferralInfo(chatId, userId) {
      try {
        const user = await getUserFullDetails(userId);
        if (!user) {
          return bot.sendMessage(chatId, 'User not found. Please type /start.');
        }

        const refLink = `https://t.me/${botUsername}?start=${user.telegram_id}`;
        const refCount = (user.referrals && user.referrals.length) ? user.referrals.length : (user.total_referrals || 0);
        const refBonus = Number(user.total_referral_bonus || 0).toFixed(2);

        let text = 
`👥 *Referral Program (Meta Farm):*\n\n` +
`Share your referral link to boost your daily mining speed & receive *10% cash commission* directly to your withdrawable balance whenever your friend deposits!\n\n` +
`📊 *Your Referral Stats:*\n` +
`• *Total Friends Invited:* \`${refCount} users\`\n` +
`• *Total 10% Cash Bonus Earned:* \`${refBonus} USDT\`\n\n` +
`🔗 *Your Personal Referral Link:*\n\`${refLink}\`\n\n`;

        if (user.referrals && user.referrals.length > 0) {
          text += `👥 *Recent Friends (Last ${Math.min(5, user.referrals.length)}):*\n`;
          user.referrals.slice(0, 5).forEach((r, idx) => {
            const name = r.first_name || r.referred_name || `User ${r.referred_id}`;
            const uname = r.username ? `@${r.username}` : (r.referred_username ? `@${r.referred_username}` : '');
            const miningStatus = r.has_started_mining ? '🟢 Mining' : '⚪ Joined';
            text += `${idx + 1}. *${name}* ${uname ? '(' + uname + ')' : ''} — ${miningStatus}\n`;
          });
        } else {
          text += `_No referrals yet. Share your invite link above to start earning!_`;
        }

        const shareText = encodeURIComponent('⚡ Join Meta Farm to mine free USDT daily on Binance Smart Chain!');
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;
        const webappUrl = globalWebappUrl || 'http://localhost:3000';

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📤 Share Link on Telegram', url: shareUrl }
              ],
              [
                { text: '🚀 Open Meta Farm', web_app: { url: webappUrl } },
                { text: '💰 My Balance', callback_data: 'my_account' }
              ]
            ]
          }
        });
      } catch (err) {
        console.error('Error in sendUserReferralInfo:', err);
      }
    }

    // Helper: Show Mining Details
    async function sendUserMiningInfo(chatId, userId) {
      try {
        const user = await getUserFullDetails(userId);
        if (!user) {
          return bot.sendMessage(chatId, 'User not found. Please type /start.');
        }

        const isMining = user.is_mining_active && user.mining_started_at;
        const now = Date.now();
        const SESSION_MS = 24 * 60 * 60 * 1000;
        let miningStatusText = '🔴 Inactive (Mining is stopped)';
        let timeLeftText = '0h 0m';

        if (isMining) {
          const startTime = new Date(user.mining_started_at).getTime();
          const elapsed = now - startTime;
          if (elapsed < SESSION_MS) {
            const remHours = Math.floor((SESSION_MS - elapsed) / (3600 * 1000));
            const remMins = Math.floor(((SESSION_MS - elapsed) % (3600 * 1000)) / (60 * 1000));
            miningStatusText = `🟢 Active Mining in Progress`;
            timeLeftText = `${remHours}h ${remMins}m remaining`;
          } else {
            miningStatusText = `⏳ 24-Hour Cycle Completed`;
            timeLeftText = 'Ready to claim reward';
          }
        }

        const minedAmount = Number(user.live_mined_unclaimed || user.mined_unclaimed || 0).toFixed(6);

        const text = 
`⛏️ *USDT Cloud Mining Status:*\n\n` +
`• *Status:* ${miningStatusText}\n` +
`• *Time Left:* \`${timeLeftText}\`\n` +
`• *Mined Bonus (Unclaimed):* \`${minedAmount} USDT\`\n` +
`• *Daily Mining Rate:* \`${Number(user.daily_mining_rate || 0.05).toFixed(4)} USDT/day\`\n` +
`• *Hashrate:* \`${Number(user.hashrate || 1.22).toFixed(2)} GH/s\`\n\n` +
`💡 _Open Meta Farm below to claim your mined bonus to your main balance or start a fresh mining cycle!_`;

        const webappUrl = globalWebappUrl || 'http://localhost:3000';
        const unclaimedNum = Number(user.live_mined_unclaimed || user.mined_unclaimed || 0);

        const actionButtons = [];
        if (unclaimedNum >= 0.0001) {
          actionButtons.push({ text: `⚡ Claim (${unclaimedNum.toFixed(4)} USDT)`, callback_data: 'bot_claim' });
        }
        if (!isMining || miningStatusText.includes('Completed')) {
          actionButtons.push({ text: '⚡ Start 24h Mining', callback_data: 'bot_start_mining' });
        }

        const keyboard = [
          [
            { text: '🚀 Open Meta Farm App', web_app: { url: webappUrl } }
          ]
        ];

        if (actionButtons.length > 0) {
          keyboard.push(actionButtons);
        }

        keyboard.push([
          { text: '💰 My Balance', callback_data: 'my_account' },
          { text: '👥 My Referrals', callback_data: 'my_referrals' }
        ]);

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } catch (err) {
        console.error('Error in sendUserMiningInfo:', err);
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

        const webappUrl = globalWebappUrl || 'http://localhost:3000';
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🚀 Open Meta Farm', web_app: { url: webappUrl } },
                { text: '💰 My Balance', callback_data: 'my_account' }
              ]
            ]
          }
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
      const text = (msg.text || '').trim();
      const chatId = msg.chat.id;
      const userId = msg.from ? msg.from.id : chatId;

      if (text.startsWith('/start')) {
        // Handled by onText(/\/start(.*)/)
        return;
      }

      if (text === '/account' || text === '/profile' || text === '/balance') {
        return sendUserAccountInfo(chatId, userId);
      }

      if (text === '/referral' || text === '/referrals' || text === '/ref' || text === '/friends') {
        return sendUserReferralInfo(chatId, userId);
      }

      if (text === '/claim') {
        return handleBotClaim(chatId, userId);
      }

      if (text === '/start_mining' || text === '/startmining') {
        return handleBotStartMining(chatId, userId);
      }

      if (text === '/mining' || text === '/mine' || text === '/bonus') {
        return sendUserMiningInfo(chatId, userId);
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
