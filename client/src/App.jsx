import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    return saved !== null ? parseFloat(saved) : 5.00;
  });

  // Mined balance starts at 0.00122000 USDT as requested
  const [minedBalance, setMinedBalance] = useState(() => {
    const saved = localStorage.getItem('usdt_mined_balance');
    return saved !== null ? parseFloat(saved) : 0.00122000;
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
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: '1',
        name: 'Shohan Ahmed',
        username: '@shohan_miner',
        avatarBg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        initial: 'S',
        time: 'Today',
        timeBn: 'আজকে',
        depositAmount: 0,
        commission: 0,
        hasDeposited: false
      },
      {
        id: '2',
        name: 'Tariqul Islam',
        username: '@tariq_usdt',
        avatarBg: 'linear-gradient(135deg, #10b981, #047857)',
        initial: 'T',
        time: 'Yesterday',
        timeBn: 'গতকাল',
        depositAmount: 0,
        commission: 0,
        hasDeposited: false
      },
      {
        id: '3',
        name: 'Rahim Khan',
        username: '@rahim_crypto',
        avatarBg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        initial: 'R',
        time: '2 days ago',
        timeBn: '২ দিন আগে',
        depositAmount: 0,
        commission: 0,
        hasDeposited: false
      },
      {
        id: '4',
        name: 'Sumon Hossain',
        username: '@sumon_vip',
        avatarBg: 'linear-gradient(135deg, #f59e0b, #b45309)',
        initial: 'S',
        time: '4 days ago',
        timeBn: '৪ দিন আগে',
        depositAmount: 0,
        commission: 0,
        hasDeposited: false
      }
    ];
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

  // Initialize Telegram WebApp and sync with Neon PostgreSQL
  useEffect(() => {
    initTelegramApp();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setUser(tgUser);
      const startRef = getTelegramStartParam();
      // Synchronize with Neon DB
      fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tgUser.id,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          username: tgUser.username,
          refCode: startRef || undefined
        })
      })
      .then(res => res.json())
      .then(data => {
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
          if (Array.isArray(u.purchased_plans) && u.purchased_plans.length > 0) {
            setPurchasedPlanIds(u.purchased_plans);
          }
          if (Array.isArray(u.referrals) && u.referrals.length > 0) {
            const mapped = u.referrals.map((r, i) => ({
              id: r.referred_id,
              name: r.referred_name || 'Member',
              username: r.referred_username ? `@${r.referred_username}` : '@user',
              avatarBg: ['linear-gradient(135deg, #3b82f6, #1d4ed8)', 'linear-gradient(135deg, #10b981, #047857)', 'linear-gradient(135deg, #8b5cf6, #6d28d9)'][i % 3],
              initial: (r.referred_name || 'M').charAt(0).toUpperCase(),
              time: 'Joined via link',
              timeBn: 'লিংকে জয়েন করেছে',
              depositAmount: Number(r.deposit_amount || 0),
              commission: Number(r.commission_earned || 0),
              hasDeposited: Number(r.deposit_amount || 0) > 0
            }));
            setReferralList(mapped);
          }
        }
      })
      .catch(err => console.log('Notice syncing user with DB:', err.message));
    }
  }, []);

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

  const BASE_DAILY = 0.029;
  const BASE_HASHRATE = 1.22;

  // Stacking daily earning: base + every purchased plan's daily profit
  const totalDailyEarning = useMemo(() => {
    const planBonus = purchasedPlanIds.reduce((sum, id) => {
      const p = DEPOSIT_PLANS.find(plan => plan.id === id);
      return sum + (p ? p.dailyProfit : 0);
    }, 0);
    return Number((BASE_DAILY + planBonus).toFixed(3));
  }, [purchasedPlanIds]);

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

  // Real-time simulated countdown / mining counter increment!
  // Ticking smoothly every 150ms based on stacked totalDailyEarning
  useEffect(() => {
    const hourlyRateNum = totalDailyEarning / 24;
    // Base increment per tick: (hourlyRate / 3600 seconds) * (0.15s)
    const baseIncrementPerTick = (hourlyRateNum / 3600) * 0.15;

    const interval = setInterval(() => {
      setMinedBalance((prev) => prev + baseIncrementPerTick);
    }, 150);

    return () => clearInterval(interval);
  }, [totalDailyEarning]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Claim mined balance to main wallet
  const handleClaim = () => {
    if (minedBalance <= 0.000001) return;
    const claimedAmt = minedBalance;
    setWalletBalance((prev) => prev + claimedAmt);
    setMinedBalance(0.00000000);

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
      subtitle: 'Daily mining income',
      amount: `+${claimedAmt.toFixed(6)} USDT`,
      time: timeStr
    };
    setActivities((prev) => [newActivity, ...prev]);

    showToast(t.claimedSuccess);

    // Sync claim to Neon PostgreSQL Database
    fetch('/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id || '987654321',
        amount: claimedAmt
      })
    }).catch(err => console.log('Notice saving claim to DB:', err.message));
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

  // When a referral user deposits, add 10% instant commission to WITHDRAW BALANCE
  const handleReferralUserDeposit = (referralId, depositAmount = 10) => {
    const commission = Number((depositAmount * 0.10).toFixed(2));

    // 1. Credit 10% commission directly to the WITHDRAW BALANCE (walletBalance)
    setWalletBalance((prev) => {
      const updated = prev + commission;
      localStorage.setItem('usdt_wallet_balance', updated.toFixed(6));
      return updated;
    });

    // 2. Add to totalReferralBonus
    setTotalReferralBonus((prev) => {
      const updated = prev + commission;
      localStorage.setItem('usdt_total_referral_bonus', updated.toFixed(2));
      return updated;
    });

    // 3. Update the referral user in the list
    setReferralList((prev) => {
      const updated = prev.map((item) => {
        if (item.id === referralId) {
          const newDep = (item.depositAmount || 0) + depositAmount;
          const newCom = (item.commission || 0) + commission;
          return {
            ...item,
            depositAmount: newDep,
            commission: newCom,
            hasDeposited: true
          };
        }
        return item;
      });
      localStorage.setItem('usdt_referral_list', JSON.stringify(updated));
      return updated;
    });

    // 4. Record transaction in history
    setTransactions((prev) => [
      {
        type: 'referral_bonus',
        amount: commission,
        network: 'BEP20',
        date: `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        status: 'Completed'
      },
      ...prev
    ]);

    // 5. User feedback
    triggerHaptic('success');
    showToast(
      lang === 'bn'
        ? `রেফারাল ফ্রেন্ড $${depositAmount} ডিপোজিট করেছে! +${commission.toFixed(2)} USDT (১০%) সরাসরি উইথড্র ব্যালেন্সে যোগ হয়েছে!`
        : `Referral user deposited $${depositAmount}! +${commission.toFixed(2)} USDT (10%) added to withdraw balance!`
    );
  };

  // Handle user withdrawal submission (Pending in account history)
  const handleWithdrawSubmit = ({ address, amount, network, netAmount, fee }) => {
    const numAmount = parseFloat(amount);

    // 1. Deduct from withdrawable walletBalance
    setWalletBalance((prev) => {
      const updated = Math.max(0, prev - numAmount);
      localStorage.setItem('usdt_wallet_balance', updated.toFixed(6));
      return updated;
    });

    // 2. Add to totalWithdraw
    setTotalWithdraw((prev) => {
      const updated = prev + numAmount;
      localStorage.setItem('usdt_total_withdraw', updated.toFixed(2));
      return updated;
    });

    // 3. Add to activities & transactions with 'Pending' status
    const timeStr = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const newActivity = {
      id: Date.now().toString(),
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

    triggerHaptic('success');
    showToast(
      lang === 'bn'
        ? `উইথড্র রিকোয়েস্ট জমা হয়েছে! অ্যাকাউন্ট হিস্টোরিতে স্ট্যাটাস পেন্ডিং রয়েছে।`
        : `Withdrawal request submitted! Status is pending in Account History.`
    );

    // Sync withdraw to Neon PostgreSQL Database
    fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id || '987654321',
        amount: numAmount,
        address,
        network: network || 'BEP20'
      })
    }).catch(err => console.log('Notice saving withdrawal to DB:', err.message));
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
        onRefresh={() => showToast(lang === 'bn' ? 'ব্যালেন্স আপডেট হয়েছে' : 'Balance updated')}
      />

      {/* Main View Area */}
      <main className="main-content">
        {currentTab === 'mining' && (
          <>
            {/* 1. MINING COUNTDOWN & DISPLAY CARD */}
            <MiningCard
              minedBalance={minedBalance}
              activePlan={activePlan}
              lang={lang}
              onClaim={handleClaim}
              walletBalance={walletBalance}
              totalInvestment={totalInvestment}
              depositBalance={depositBalance}
              dailyEarning={`${totalDailyEarning.toFixed(3)} USDT`}
              miningSpeed={totalHashrate}
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
            onReferralUserDeposit={handleReferralUserDeposit}
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
