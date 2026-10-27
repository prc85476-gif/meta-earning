import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { MiningCard } from './components/MiningCard';
import { QuickActions } from './components/QuickActions';
import { DepositModal } from './components/DepositModal';
import { WithdrawModal } from './components/WithdrawModal';
import { LanguageModal } from './components/LanguageModal';
import { PLANS_DATA } from './components/PlansTab';
import { FriendsTab } from './components/FriendsTab';
import { ProfileTab } from './components/ProfileTab';
import { BottomNav } from './components/BottomNav';
import { DepositPlansSection, DEPOSIT_PLANS } from './components/DepositPlansSection';
import { RecentActivity } from './components/RecentActivity';
import { initTelegramApp, getTelegramUser, getTelegramStartParam, triggerHaptic } from './utils/telegram';
import { translations, formatUSDT } from './utils/formatters';
import { ShieldCheck, Cpu, Gift, CheckCircle2 } from 'lucide-react';

export function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('usdt_lang') || 'en');
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [depositPreloadedAmount, setDepositPreloadedAmount] = useState(2);
  const [currentTab, setCurrentTab] = useState('mining');
  const [user, setUser] = useState({ id: '987654321', first_name: 'Mining User', username: 'miner_bd' });

  // Balances
  const [walletBalance, setWalletBalance] = useState(() => {
    const saved = localStorage.getItem('usdt_wallet_balance');
    return saved !== null ? parseFloat(saved) : 0.00;
  });

  // 24-Hour Mining Session Constants & State
  const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours in ms
  const MIN_CLAIM_AMOUNT = 0.01; // Minimum $0.01 USDT required to claim

  const [miningStartTime, setMiningStartTime] = useState(() => {
    const saved = localStorage.getItem('usdt_mining_start_time');
    return saved ? parseInt(saved, 10) : null;
  });

  const [isMiningActive, setIsMiningActive] = useState(() => {
    return localStorage.getItem('usdt_is_mining_active') === 'true';
  });

  // Track amount claimed so far within the current 24-hour cycle
  const [claimedInSession, setClaimedInSession] = useState(() => {
    const saved = localStorage.getItem('usdt_claimed_in_session');
    return saved !== null ? parseFloat(saved) : 0.00;
  });

  const [isClaiming, setIsClaiming] = useState(false);
  const [miningStatus, setMiningStatus] = useState('idle'); // 'idle' | 'mining' | 'completed'
  const [miningTimeLeftMs, setMiningTimeLeftMs] = useState(SESSION_DURATION_MS);

  // Mined balance: 0 when idle/unstarted, smoothly generated up to daily rate during 24h
  const [minedBalance, setMinedBalance] = useState(() => {
    const savedStart = localStorage.getItem('usdt_mining_start_time');
    const savedActive = localStorage.getItem('usdt_is_mining_active') === 'true';
    if (!savedStart || !savedActive) {
      const savedMined = localStorage.getItem('usdt_mined_balance');
      return savedMined !== null ? parseFloat(savedMined) : 0.00000000;
    }
    return 0.00000000;
  });

  // Track purchased/unlocked plans (stacking daily profit and hashrate)
  const [purchasedPlanIds, setPurchasedPlanIds] = useState(() => {
    const saved = localStorage.getItem('usdt_purchased_plans');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });
  const [pendingPlanToActivate, setPendingPlanToActivate] = useState(null);

  const [activePlan, setActivePlan] = useState(() => {
    const savedId = localStorage.getItem('usdt_active_plan');
    const found = PLANS_DATA.find(p => p.id === savedId);
    return found || PLANS_DATA[0];
  });

  const [totalInvestment, setTotalInvestment] = useState(() => {
    const saved = localStorage.getItem('usdt_total_investment');
    return saved !== null ? parseFloat(saved) : 0.00;
  });

  // Current available deposit balance (used to purchase plans, non-withdrawable)
  const [depositBalance, setDepositBalance] = useState(() => {
    const saved = localStorage.getItem('usdt_deposit_balance');
    if (saved !== null) return parseFloat(saved);
    const legacy = localStorage.getItem('usdt_total_investment');
    return legacy !== null ? parseFloat(legacy) : 0.00;
  });

  const [referralList, setReferralList] = useState(() => {
    const saved = localStorage.getItem('usdt_referral_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Clear old mock list or simulated 10$ deposit test data
          if (parsed.some(p => p.id === '1' || p.name === 'Shohan Ahmed' || p.id === '2' || Number(p.depositAmount) === 10)) {
            localStorage.removeItem('usdt_referral_list');
            return [];
          }
          return parsed;
        }
      } catch {}
    }
    return [];
  });

  const [totalReferralBonus, setTotalReferralBonus] = useState(() => {
    const saved = localStorage.getItem('usdt_total_referral_bonus');
    if (saved !== null) {
      const parsed = parseFloat(saved);
      // Reset old mock 1.45 to 0.00 if present
      if (parsed === 1.45) {
        localStorage.setItem('usdt_total_referral_bonus', '0.00');
        return 0.00;
      }
      return parsed;
    }
    return 0.00;
  });

  const [totalWithdraw, setTotalWithdraw] = useState(() => {
    const saved = localStorage.getItem('usdt_total_withdraw');
    return saved !== null ? parseFloat(saved) : 0.00;
  });

  const [transactions, setTransactions] = useState(() => {
    const saved = localStorage.getItem('usdt_transactions');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      { type: 'deposit', amount: 5.00, network: 'BEP20', date: 'Today, 10:30 AM', status: 'Completed' },
      { type: 'claim', amount: 0.00122, network: 'Internal', date: 'Today, 11:15 AM', status: 'Completed' }
    ];
  });

  // Recent Activity matching 2nd image 100%
  const [activities, setActivities] = useState(() => {
    const saved = localStorage.getItem('usdt_recent_activities');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: '1',
        type: 'mining',
        title: 'Mining Reward',
        subtitle: 'Daily mining income',
        amount: '+0.000122 USDT',
        time: 'Today, 10:24 AM'
      },
      {
        id: '2',
        type: 'deposit',
        title: 'Deposit',
        subtitle: 'USDT deposit completed',
        amount: '+5.000000 USDT',
        time: 'Yesterday, 03:15 PM'
      },
      {
        id: '3',
        type: 'referral',
        title: 'Referral Bonus',
        subtitle: 'From your friend',
        amount: '+0.010000 USDT',
        time: 'Yesterday, 11:42 AM'
      }
    ];
  });

  // Modals & toast
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const t = translations[lang] || translations.en;

  const mapTransactionsToActivities = useCallback((txList) => {
    if (!Array.isArray(txList) || txList.length === 0) return [];
    return txList.map((tx) => {
      const numAmt = parseFloat(tx.amount || 0);
      const isWithdraw = tx.type === 'withdraw';
      const isDeposit = tx.type === 'deposit';
      const isClaim = tx.type === 'claim';
      const isRefBonus = tx.type === 'referral_bonus';

      let title = 'Mining Reward';
      let subtitle = 'Daily mining income';
      let amtStr = `+${numAmt.toFixed(2)} USDT`;

      if (isWithdraw) {
        title = 'Withdrawal';
        const addr = tx.wallet_address || '';
        const shortAddr = addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
        subtitle = `USDT(${tx.network || 'BEP20'}) • ${shortAddr || 'BEP20'}`;
        amtStr = `-${numAmt.toFixed(2)} USDT`;
      } else if (isDeposit) {
        title = 'Deposit';
        subtitle = `USDT (${tx.network || 'BEP20'}) deposit`;
        amtStr = `+${numAmt.toFixed(2)} USDT`;
      } else if (isRefBonus) {
        title = 'Referral Bonus';
        subtitle = 'From your friend';
        amtStr = `+${numAmt.toFixed(2)} USDT`;
      }

      const d = tx.created_at ? new Date(tx.created_at) : new Date();
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const timeStr = isToday 
        ? `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      return {
        id: String(tx.id),
        type: isWithdraw ? 'withdraw' : (isDeposit ? 'deposit' : (isClaim ? 'mining' : 'referral')),
        title,
        subtitle,
        amount: amtStr,
        time: timeStr,
        status: tx.status || 'Completed'
      };
    });
  }, []);

  // Reusable DB Synchronizer: Instantly reflects withdrawal approval, balance, and plans
  const syncWithDb = useCallback(async (showToastNotice = false) => {
    const tgUser = getTelegramUser();
    const actualId = tgUser?.id || user?.id || (tgUser ? String(tgUser.id) : null);
    if (!actualId) return;

    const startRef = getTelegramStartParam();
    try {
      const res = await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actualId,
          first_name: tgUser?.first_name || user?.first_name,
          last_name: tgUser?.last_name || user?.last_name,
          username: tgUser?.username || user?.username,
          photo_url: tgUser?.photo_url || user?.photo_url,
          refCode: startRef || undefined
        })
      });
      const data = await res.json();
      if (data && data.success && data.user) {
        const u = data.user;
        if (u.wallet_balance !== undefined) setWalletBalance(Number(u.wallet_balance));
        if (u.deposit_balance !== undefined) setDepositBalance(Number(u.deposit_balance));
        if (u.total_deposit !== undefined) setTotalInvestment(Number(u.total_deposit));
        if (u.total_withdraw !== undefined) setTotalWithdraw(Number(u.total_withdraw));
        if (u.total_referral_bonus !== undefined) setTotalReferralBonus(Number(u.total_referral_bonus));
        if (u.withdraw_address) {
          localStorage.setItem('usdt_locked_withdraw_address', u.withdraw_address);
        }
        if (u.claimed_in_session !== undefined) {
          setClaimedInSession(Number(u.claimed_in_session));
        }

        if (u.mining_started_at && u.is_mining_active) {
          const serverStart = new Date(u.mining_started_at).getTime();
          const elapsed = Date.now() - serverStart;
          if (elapsed < SESSION_DURATION_MS) {
            setMiningStartTime(serverStart);
            setIsMiningActive(true);
            setMiningStatus('mining');
            localStorage.setItem('usdt_mining_start_time', serverStart.toString());
            localStorage.setItem('usdt_is_mining_active', 'true');
          } else {
            setIsMiningActive(false);
            setMiningStatus('completed');
            localStorage.setItem('usdt_is_mining_active', 'false');
            if (u.live_mined_unclaimed !== undefined) {
              setMinedBalance(Number(u.live_mined_unclaimed));
            }
          }
        } else {
          setIsMiningActive(false);
          localStorage.setItem('usdt_is_mining_active', 'false');
          const uncollected = Number(u.live_mined_unclaimed || u.mined_unclaimed || 0);
          if (uncollected > 0.000001) {
            setMiningStatus('completed');
            setMinedBalance(uncollected);
          } else {
            setMiningStatus('idle');
          }
        }

        if (Array.isArray(u.purchased_plans) && u.purchased_plans.length > 0) {
          setPurchasedPlanIds(u.purchased_plans);
        }
        if (u.daily_mining_rate !== undefined) {
          setDailyMiningRate(Number(u.daily_mining_rate));
        }
        if (Array.isArray(u.referrals)) {
          const mapped = u.referrals.map((r) => ({
            id: r.referred_id,
            name: (r.first_name ? `${r.first_name} ${r.last_name || ''}`.trim() : r.referred_name) || (r.referred_id ? `User ${r.referred_id}` : 'Member'),
            username: r.username ? `@${r.username}` : (r.referred_username ? `@${r.referred_username}` : (r.referred_id ? `ID: ${r.referred_id}` : '@user')),
            photo_url: r.photo_url || null,
            time: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Joined via link',
            timeBn: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'লিংকে জয়েন করেছে',
            depositAmount: Number(r.deposit_amount || 0),
            commission: Number(r.commission_earned || 0),
            hasDeposited: Number(r.deposit_amount || 0) > 0
          }));
          setReferralList(mapped);
          localStorage.setItem('usdt_referral_list', JSON.stringify(mapped));
        }

        // SYNC TRANSACTIONS & ACTIVITIES: Update Pending -> Completed instantly
        if (Array.isArray(u.transactions) && u.transactions.length > 0) {
          const mappedActs = mapTransactionsToActivities(u.transactions);
          setActivities(mappedActs);
          setTransactions(u.transactions);
        }

        if (showToastNotice) {
          showToast(lang === 'bn' ? 'ডাটা ও হিস্টোরি রিফ্রেশ হয়েছে ✅' : 'History & Balance updated ✅');
        }
      }
    } catch (err) {
      console.log('Notice syncing user with DB:', err.message);
    }
  }, [user, lang, mapTransactionsToActivities]);

  // Initial Sync on WebApp start
  useEffect(() => {
    initTelegramApp();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setUser(tgUser);
    }
    syncWithDb();
  }, [syncWithDb]);

  // Auto-sync with DB every 6 seconds to update withdrawal status from Pending to Completed instantly
  useEffect(() => {
    const timer = setInterval(() => {
      syncWithDb(false);
    }, 6000);
    return () => clearInterval(timer);
  }, [syncWithDb]);

  // Sync immediately when switching tabs (e.g. to Profile or Mining)
  useEffect(() => {
    syncWithDb(false);
  }, [currentTab, syncWithDb]);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('usdt_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('usdt_wallet_balance', walletBalance.toString());
  }, [walletBalance]);

  useEffect(() => {
    localStorage.setItem('usdt_mined_balance', minedBalance.toString());
  }, [minedBalance]);

  useEffect(() => {
    localStorage.setItem('usdt_active_plan', activePlan.id);
  }, [activePlan]);

  useEffect(() => {
    localStorage.setItem('usdt_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('usdt_recent_activities', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    localStorage.setItem('usdt_total_investment', totalInvestment.toString());
  }, [totalInvestment]);

  useEffect(() => {
    localStorage.setItem('usdt_deposit_balance', depositBalance.toString());
  }, [depositBalance]);

  useEffect(() => {
    localStorage.setItem('usdt_purchased_plans', JSON.stringify(purchasedPlanIds));
  }, [purchasedPlanIds]);

  useEffect(() => {
    localStorage.setItem('usdt_total_referral_bonus', totalReferralBonus.toString());
  }, [totalReferralBonus]);

  useEffect(() => {
    localStorage.setItem('usdt_total_withdraw', totalWithdraw.toString());
  }, [totalWithdraw]);

  useEffect(() => {
    localStorage.setItem('usdt_claimed_in_session', claimedInSession.toString());
  }, [claimedInSession]);

  const BASE_DAILY = 0.05;
  const BASE_HASHRATE = 1.22;
  const [dailyMiningRate, setDailyMiningRate] = useState(0.05);

  // Stacking daily earning: base + every purchased plan's daily profit
  const totalDailyEarning = useMemo(() => {
    const planBonus = purchasedPlanIds.reduce((sum, id) => {
      const p = DEPOSIT_PLANS.find(plan => plan.id === id);
      return sum + (p ? p.dailyProfit : 0);
    }, 0);
    const base = dailyMiningRate || BASE_DAILY;
    return Number((base + planBonus).toFixed(4));
  }, [purchasedPlanIds, dailyMiningRate]);

  // Stacking hashrate: base + every purchased plan's hashrate
  const totalHashrate = useMemo(() => {
    const planBonusGh = purchasedPlanIds.reduce((sum, id) => {
      const p = DEPOSIT_PLANS.find(plan => plan.id === id);
      if (!p) return sum;
      const val = parseFloat(p.hashrate.replace(/[^0-9.]/g, '')) || 0;
      return sum + val;
    }, 0);
    const total = BASE_HASHRATE + planBonusGh;
    return `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GH/s`;
  }, [purchasedPlanIds]);

  const hasNotifiedClaimRef = useRef(false);
  const hasNotifiedStoppedRef = useRef(false);

  // 24-Hour Mining Engine: Real-time clock calculation with 0.01$ minimum claim support
  useEffect(() => {
    if (!miningStartTime || !isMiningActive) {
      const savedMined = parseFloat(localStorage.getItem('usdt_mined_balance') || '0');
      if (savedMined > 0.000001) {
        setMiningStatus('completed');
        setMinedBalance(savedMined);
      } else {
        setMiningStatus('idle');
        setMinedBalance(0);
      }
      setMiningTimeLeftMs(SESSION_DURATION_MS);
      return;
    }

    const updateMiningTick = () => {
      const now = Date.now();
      const elapsed = now - miningStartTime;

      if (elapsed >= SESSION_DURATION_MS) {
        // 24 Hours completed: Mining turns OFF automatically!
        setIsMiningActive(false);
        setMiningStatus('completed');
        setMiningTimeLeftMs(0);

        // Trigger 24h stopped notification to Telegram Bot
        if (!hasNotifiedStoppedRef.current && user?.id) {
          hasNotifiedStoppedRef.current = true;
          fetch('/api/mining/notify-threshold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, type: 'session_stopped' })
          }).catch(() => {});
        }

        // Remaining uncollected amount from this 24h session
        const remainingUncollected = Math.max(0, totalDailyEarning - claimedInSession);
        setMinedBalance(remainingUncollected);

        localStorage.setItem('usdt_is_mining_active', 'false');
        localStorage.setItem('usdt_mined_balance', remainingUncollected.toString());
      } else {
        // Active 24h mining session
        setMiningStatus('mining');
        const remaining = SESSION_DURATION_MS - elapsed;
        setMiningTimeLeftMs(remaining);

        // Calculate smooth progress
        const progress = Math.max(0, Math.min(1, elapsed / SESSION_DURATION_MS));
        const totalGeneratedSoFar = totalDailyEarning * progress;
        const currentUnclaimed = Math.max(0, totalGeneratedSoFar - claimedInSession);

        // Trigger 0.01 USDT reached notification to Telegram Bot
        if (currentUnclaimed >= MIN_CLAIM_AMOUNT && !hasNotifiedClaimRef.current && user?.id) {
          hasNotifiedClaimRef.current = true;
          fetch('/api/mining/notify-threshold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, type: 'claim_ready', amount: currentUnclaimed })
          }).catch(() => {});
        }

        setMinedBalance(currentUnclaimed);
        localStorage.setItem('usdt_mined_balance', currentUnclaimed.toString());
      }
    };

    updateMiningTick();
    const interval = setInterval(updateMiningTick, 150);
    return () => clearInterval(interval);
  }, [miningStartTime, isMiningActive, totalDailyEarning, claimedInSession, user?.id]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Claim mined balance during active session (Requires minimum 0.01 USDT)
  const handleClaim = () => {
    if (minedBalance < MIN_CLAIM_AMOUNT || isClaiming) return;
    setIsClaiming(true);
    triggerHaptic('medium');

    const claimedAmt = minedBalance;
    setTimeout(() => {
      // 1. Credit to Main Wallet Balance
      setWalletBalance((prev) => {
        const next = prev + claimedAmt;
        localStorage.setItem('usdt_wallet_balance', next.toFixed(6));
        return next;
      });

      // 2. Add to claimed amount in current 24h cycle
      setClaimedInSession((prev) => {
        const next = prev + claimedAmt;
        localStorage.setItem('usdt_claimed_in_session', next.toString());
        return next;
      });

      // 3. Reset active uncollected balance to 0
      setMinedBalance(0);
      localStorage.setItem('usdt_mined_balance', '0');
      setIsClaiming(false);
      triggerHaptic('success');

      try {
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.3 }
        });
      } catch (e) {}

      const timeStr = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const newTx = {
        type: 'claim',
        amount: claimedAmt,
        network: 'Internal Mining Pool',
        date: timeStr,
        status: 'Completed'
      };
      setTransactions((prev) => [newTx, ...prev]);

      const newActivity = {
        id: Date.now().toString(),
        type: 'mining',
        title: 'Mining Reward',
        subtitle: 'Claimed to Main Balance',
        amount: `+${claimedAmt.toFixed(6)} USDT`,
        time: timeStr
      };
      setActivities((prev) => [newActivity, ...prev]);

      fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || '987654321',
          amount: claimedAmt,
          restart: false
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.user) {
          setWalletBalance(Number(data.user.wallet_balance));
        }
      })
      .catch(err => console.log('Notice saving claim to DB:', err.message));

      showToast(
        lang === 'bn'
          ? `+${claimedAmt.toFixed(4)} USDT ওয়ালেটে ট্রান্সফার হয়েছে!`
          : `+${claimedAmt.toFixed(4)} USDT claimed to Main Balance!`
      );
    }, 600);
  };

  // Start fresh 24-hour mining cycle (or claim remaining and restart)
  const handleStartMining = () => {
    triggerHaptic('medium');

    // Begin fresh 24-hour session
    const now = Date.now();
    setMiningStartTime(now);
    setIsMiningActive(true);
    setClaimedInSession(0);
    setMinedBalance(0);
    hasNotifiedClaimRef.current = false;
    hasNotifiedStoppedRef.current = false;
    setMiningTimeLeftMs(SESSION_DURATION_MS);
    setMiningStatus('mining');

    localStorage.setItem('usdt_mining_start_time', now.toString());
    localStorage.setItem('usdt_is_mining_active', 'true');
    localStorage.setItem('usdt_claimed_in_session', '0');
    localStorage.setItem('usdt_mined_balance', '0');

    fetch('/api/mining/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id || '987654321'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.success && data.user) {
        setWalletBalance(Number(data.user.wallet_balance));
        if (data.user.mining_started_at) {
          const s = new Date(data.user.mining_started_at).getTime();
          setMiningStartTime(s);
          localStorage.setItem('usdt_mining_start_time', s.toString());
        }
      }
    })
    .catch(err => console.log('Notice starting mining in DB:', err.message));

    showToast(
      lang === 'bn'
        ? `⚡ ২৪ ঘণ্টার ইউএসডিটি মাইনিং শুরু হয়েছে! (নূন্যতম ক্লেইম $০.০১)`
        : `⚡ 24-hour USDT mining started! (Min claim $0.01)`
    );

    triggerHaptic('success');
    try {
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.3 }
      });
    } catch (e) {}
  };

  // Handle verified BSC deposit
  const handleSimulateDeposit = (amt = 10, txHash = '') => {
    // 1. DEPOSIT CREDITS TO 'DEPOSIT BALANCE' ONLY (Locked in mining, NOT directly withdrawable!)
    let updatedDepositBal = depositBalance + amt;
    setDepositBalance(updatedDepositBal);
    setTotalInvestment((prev) => prev + amt);

    // Check if user clicked to purchase a pending plan
    let activatedPlanName = '';
    let targetPlan = pendingPlanToActivate;

    if (targetPlan && updatedDepositBal >= targetPlan.price) {
      // Deduct the plan price from depositBalance!
      updatedDepositBal = Math.max(0, updatedDepositBal - targetPlan.price);
      setDepositBalance(updatedDepositBal);
      localStorage.setItem('usdt_deposit_balance', updatedDepositBal.toString());

      if (!purchasedPlanIds.includes(targetPlan.id)) {
        const nextPurchased = [...purchasedPlanIds, targetPlan.id];
        setPurchasedPlanIds(nextPurchased);
        activatedPlanName = targetPlan.name;
      }
      setPendingPlanToActivate(null);
    }

    const timeStr = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const newTx = {
      type: 'deposit',
      amount: amt,
      network: 'USDT (BEP20)',
      txHash: txHash,
      date: timeStr,
      status: 'Completed'
    };
    setTransactions((prev) => [newTx, ...prev]);

    const newActivity = {
      id: Date.now().toString(),
      type: 'deposit',
      title: 'Deposit',
      subtitle: txHash ? `BEP20 Tx: ${txHash.substring(0, 8)}...` : 'USDT BEP20 deposit completed',
      amount: `+${amt.toFixed(6)} USDT`,
      time: timeStr
    };
    setActivities((prev) => [newActivity, ...prev]);

    if (activatedPlanName) {
      showToast(
        lang === 'bn' 
          ? `+${amt.toFixed(2)} USDT ডিপোজিট হয়েছে ও ${activatedPlanName} চালু হয়েছে! (অবশিষ্ট ডিপোজিট ব্যালেন্স: $${updatedDepositBal.toFixed(2)})` 
          : `+${amt.toFixed(2)} USDT deposited & ${activatedPlanName} activated! (Deposit Balance: $${updatedDepositBal.toFixed(2)})`
      );
    } else {
      showToast(
        lang === 'bn' 
          ? `+${amt.toFixed(2)} USDT ডিপোজিট ব্যালেন্সে (Deposit Balance) সফলভাবে জমা হয়েছে!` 
          : `+${amt.toFixed(2)} USDT credited to Deposit Balance!`
      );
    }
  };

  // Buy/activate deposit mining power plan using DEPOSIT BALANCE ONLY (Main Balance cannot be used!)
  const handleSelectDepositPlan = (plan) => {
    // Only deposit balance can be used to buy plans
    if (depositBalance >= plan.price) {
      // Deduct/Minus plan price from Deposit Balance
      const remainingDeposit = Math.max(0, depositBalance - plan.price);
      setDepositBalance(remainingDeposit);
      localStorage.setItem('usdt_deposit_balance', remainingDeposit.toString());

      if (!purchasedPlanIds.includes(plan.id)) {
        const nextPurchased = [...purchasedPlanIds, plan.id];
        setPurchasedPlanIds(nextPurchased);
      }

      const timeStr = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      setTransactions((prev) => [
        {
          type: 'deposit_plan',
          amount: plan.price,
          network: 'Deposit Balance',
          date: timeStr,
          status: 'Active'
        },
        ...prev
      ]);

      const newDaily = (totalDailyEarning + plan.dailyProfit).toFixed(3);
      showToast(
        lang === 'bn' 
          ? `${plan.name} ($${plan.price}) কেনা হয়েছে! ডিপোজিট ব্যালেন্স থেকে -$${plan.price} কাটা হয়েছে। (অবশিষ্ট: $${remainingDeposit.toFixed(2)})` 
          : `${plan.name} ($${plan.price}) purchased! -$${plan.price} deducted from Deposit Balance. (Remaining: $${remainingDeposit.toFixed(2)})`
      );

      // Sync plan purchase to Neon PostgreSQL Database
      fetch('/api/plans/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || '987654321',
          planId: plan.id
        })
      }).catch(err => console.log('Notice saving plan purchase to DB:', err.message));
    } else {
      // Insufficient deposit balance - Main balance is NOT permitted for plans
      const needed = Math.max(3, plan.price - depositBalance);
      setPendingPlanToActivate(plan);
      setDepositPreloadedAmount(plan.price);
      setIsDepositOpen(true);
      showToast(
        lang === 'bn' 
          ? `মেইন ব্যালেন্স দিয়ে প্ল্যান কেনা যাবে না। $${plan.price} ডিপোজিট করে ${plan.name} চালু করুন` 
          : `Plans can only be bought with Deposit Balance. Deposit $${plan.price} to activate ${plan.name}`
      );
    }
  };


  // Handle user withdrawal submission (Pending in account history)
  const handleWithdrawSubmit = async ({ address, amount, network, netAmount, fee }) => {
    const numAmount = parseFloat(amount);
    const tgUser = getTelegramUser();
    const actualUserId = tgUser?.id ? String(tgUser.id) : (user?.id ? String(user.id) : '987654321');

    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: actualUserId,
          amount: numAmount,
          address,
          network: network || 'BEP20'
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return {
          success: false,
          message: data.message || (lang === 'bn' ? 'উইথড্র প্রক্রিয়াকরণে সমস্যা হয়েছে।' : 'Withdrawal failed')
        };
      }

      // 1. Deduct from withdrawable walletBalance
      const newBal = data.walletBalance !== undefined 
        ? Number(data.walletBalance) 
        : Math.max(0, walletBalance - numAmount);
      setWalletBalance(newBal);
      localStorage.setItem('usdt_wallet_balance', newBal.toFixed(6));

      // 2. Add to totalWithdraw
      const newTotalWd = data.totalWithdraw !== undefined 
        ? Number(data.totalWithdraw) 
        : (totalWithdraw + numAmount);
      setTotalWithdraw(newTotalWd);
      localStorage.setItem('usdt_total_withdraw', newTotalWd.toFixed(2));

      // 3. Add to activities & transactions with 'Pending' status
      const timeStr = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const txId = data.transaction?.id ? String(data.transaction.id) : Date.now().toString();

      const newActivity = {
        id: txId,
        type: 'withdraw',
        title: 'Withdrawal',
        subtitle: `USDT (${network}) • ${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
        amount: `-${numAmount.toFixed(2)} USDT`,
        time: timeStr,
        status: 'Pending'
      };
      setActivities((prev) => [newActivity, ...prev]);

      setTransactions((prev) => [
        {
          id: txId,
          type: 'withdraw',
          amount: numAmount,
          network: `${network} (BSC)`,
          address,
          date: timeStr,
          status: 'Pending'
        },
        ...prev
      ]);

      // 4. Permanently lock address and register as used
      localStorage.setItem('usdt_locked_withdraw_address', address);
      try {
        const existing = JSON.parse(localStorage.getItem('usdt_registered_addresses') || '[]');
        if (!existing.includes(address.toLowerCase())) {
          existing.push(address.toLowerCase());
          localStorage.setItem('usdt_registered_addresses', JSON.stringify(existing));
        }
      } catch {}

      showToast(
        lang === 'bn'
          ? `উইথড্র রিকোয়েস্ট জমা হয়েছে! অ্যাকাউন্ট হিস্টোরিতে স্ট্যাটাস পেন্ডিং রয়েছে।`
          : `Withdrawal request submitted! Status is pending in Account History.`
      );

      return {
        success: true,
        transaction: data.transaction
      };
    } catch (err) {
      console.error('Withdraw submit error:', err);
      return {
        success: false,
        message: err.message || (lang === 'bn' ? 'সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে।' : 'Network connection error')
      };
    }
  };

  // If tab was previously set to 'plans' or 'wallet', fallback to 'mining'
  useEffect(() => {
    if (currentTab === 'plans' || currentTab === 'wallet') {
      setCurrentTab('mining');
    }
  }, [currentTab]);

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="toast-msg">
          <CheckCircle2 size={16} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        user={user}
        activePlan={activePlan}
        lang={lang}
        onOpenLanguage={() => setIsLanguageModalOpen(true)}
        onRefresh={() => syncWithDb(true)}
      />

      {/* Main View Area */}
      <main className="main-content">
        {currentTab === 'mining' && (
          <>
            {/* 1. 24-HOUR MINING COUNTDOWN & DISPLAY CARD */}
            <MiningCard
              minedBalance={minedBalance}
              activePlan={activePlan}
              lang={lang}
              walletBalance={walletBalance}
              totalInvestment={totalInvestment}
              depositBalance={depositBalance}
              dailyEarning={`${totalDailyEarning.toFixed(3)} USDT`}
              miningSpeed={totalHashrate}
              miningStatus={miningStatus}
              miningTimeLeftMs={miningTimeLeftMs}
              onStartMining={handleStartMining}
              onClaim={handleClaim}
              isClaiming={isClaiming}
              minClaimAmount={MIN_CLAIM_AMOUNT}
            />

            {/* 2. DEPOSIT & WITHDRAW ACTION BUTTONS (As explicitly requested by user) */}
            <QuickActions
              lang={lang}
              onOpenDeposit={() => {
                setDepositPreloadedAmount(2);
                setIsDepositOpen(true);
              }}
              onOpenWithdraw={() => setIsWithdrawOpen(true)}
            />

            {/* Quick summary stats */}
            <div className="quick-overview-card">
              <div className="overview-header">
                <span className="overview-title">
                  <ShieldCheck size={16} color="#10b981" />
                  {lang === 'bn' ? 'ইউএসডিটি মাইনিং সারসংক্ষেপ' : 'USDT Mining Overview'}
                </span>
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
                  Active 24/7
                </span>
              </div>

              <div className="overview-grid">
                <div className="overview-box">
                  <span className="overview-box-label">{t.mainBalance || 'Main Balance'}</span>
                  <div className="overview-box-val" style={{ color: '#0f172a' }}>
                    ${formatUSDT(walletBalance)}
                  </div>
                </div>

                <div className="overview-box">
                  <span className="overview-box-label">{t.totalRefBonus || 'Total Ref Bonus'}</span>
                  <div className="overview-box-val" style={{ color: '#2563eb' }}>
                    +{formatUSDT(totalReferralBonus)} USDT
                  </div>
                </div>

                <div className="overview-box">
                  <span className="overview-box-label">{t.totalWithdraw || 'Total Withdraw'}</span>
                  <div className="overview-box-val" style={{ color: '#10b981' }}>
                    {formatUSDT(totalWithdraw)} USDT
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 7 DEPOSIT POWER PLANS (Progressive - purchased plans are removed) */}
            <DepositPlansSection
              onSelectPlan={handleSelectDepositPlan}
              lang={lang}
              purchasedPlanIds={purchasedPlanIds}
            />
          </>
        )}

        {currentTab === 'friends' && (
          <FriendsTab 
            user={user} 
            lang={lang} 
            totalReferralBonus={totalReferralBonus} 
            referralList={referralList}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileTab
            user={user}
            activePlan={activePlan}
            lang={lang}
            totalInvestment={totalInvestment}
            depositBalance={depositBalance}
            totalWithdraw={totalWithdraw}
            activities={activities}
            onOpenDeposit={() => {
              setDepositPreloadedAmount(2);
              setIsDepositOpen(true);
            }}
            onOpenWithdraw={() => setIsWithdrawOpen(true)}
            onOpenLanguage={() => setIsLanguageModalOpen(true)}
          />
        )}
      </main>

      {/* 3. MODALS */}
      <DepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        onSimulateDeposit={handleSimulateDeposit}
        lang={lang}
        prefilledAmount={depositPreloadedAmount}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        walletBalance={walletBalance}
        onWithdrawSubmit={handleWithdrawSubmit}
        lang={lang}
      />

      {/* Language Selection Modal */}
      <LanguageModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        currentLang={lang}
        onSelectLang={(code) => {
          setLang(code);
          localStorage.setItem('usdt_lang', code);
        }}
      />

      {/* 4. FIXED BOTTOM NAVIGATION BAR */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        lang={lang}
      />
    </div>
  );
}

export default App;
