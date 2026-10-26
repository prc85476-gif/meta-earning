import React from 'react';
import { TrendingUp, Zap, Coins, Wallet, Play, ArrowRight, Loader2 } from 'lucide-react';
import { formatMiningNumber } from '../utils/formatters';

export const MiningCard = ({
  minedBalance = 0,
  activePlan,
  lang,
  walletBalance = 0,
  totalInvestment = 0.00,
  depositBalance,
  dailyEarning,
  miningSpeed,
  miningStatus = 'idle', // 'idle' | 'mining' | 'completed'
  miningTimeLeftMs = 86400000,
  onStartMining,
  onClaim,
  isClaiming = false,
  minClaimAmount = 0.01
}) => {
  const formatCountdown = (ms) => {
    if (!ms || ms <= 0) return '00:00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formattedMined = formatMiningNumber(minedBalance, 8);
  const dotIndex = formattedMined.indexOf('.');
  const intPart = dotIndex !== -1 ? formattedMined.substring(0, dotIndex) : formattedMined;
  const decPart = dotIndex !== -1 ? formattedMined.substring(dotIndex + 1) : '00000000';
  
  // First 6 decimals in dark navy, last 2 micro digits in bright green
  const prefixDec = decPart.substring(0, 6);
  const tailDec = decPart.substring(6);

  const isMiningActive = miningStatus === 'mining';
  const isClaimReady = minedBalance >= minClaimAmount;

  return (
    <section className="mining-card-v2" aria-label="Mining Status">
      {/* 1. Header: Left Title with Icon & Right 'Wallet Balance' Pill */}
      <div className="mining-card-header">
        <div className="mining-title-group">
          <div className="mining-title-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00b074" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 7 9 13 13 9 21 17" />
              <polyline points="17 17 21 17 21 13" />
              <rect x="4" y="15" width="2.5" height="5" rx="0.5" />
              <rect x="9.5" y="11" width="2.5" height="9" rx="0.5" />
              <rect x="15" y="7" width="2.5" height="13" rx="0.5" />
            </svg>
          </div>
          <span className="mining-title-text">Current Mining Balance</span>
        </div>

        <div className="wallet-connected-pill">
          <div className="wallet-pill-icon">
            <Wallet size={13} color="#00b074" strokeWidth={2.2} />
          </div>
          <span className="wallet-pill-text">
            ${Number(walletBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT
          </span>
        </div>
      </div>

      {/* 2. 24h Session Status Bar */}
      <div className="mining-session-bar">
        {isMiningActive && (
          <div className="session-status-pill status-active">
            <span className="pulse-dot"></span>
            <span className="session-label">
              {lang === 'bn' 
                ? `২৪ ঘণ্টা মাইনিং চালু (নূন্যতম ক্লেইম $${minClaimAmount})` 
                : `24h Mining Active (Min Claim $${minClaimAmount})`}
            </span>
            <span className="session-countdown">
              ⏳ {formatCountdown(miningTimeLeftMs)} {lang === 'bn' ? 'বাকি' : 'left'}
            </span>
          </div>
        )}

        {miningStatus === 'idle' && (
          <div className="session-status-pill status-idle">
            <span className="idle-dot"></span>
            <span className="session-label">
              {lang === 'bn' ? '২৪ ঘণ্টার দৈনিক মাইনিং শুরু করতে Start চাপুন' : '24h Session Inactive • Click Start to Begin'}
            </span>
          </div>
        )}

        {miningStatus === 'completed' && (
          <div className="session-status-pill status-completed">
            <span className="completed-dot"></span>
            <span className="session-label">
              {lang === 'bn' ? '২৪ ঘণ্টা শেষ ও মাইনিং বন্ধ! Start চাপলে রিওয়ার্ড যোগ হবে ও আবার শুরু হবে' : '24h Complete & Stopped! Click Start to claim & restart'}
            </span>
          </div>
        )}
      </div>

      {/* 3. Mining Digits & Action Button (Start when idle/completed, Claim when active) */}
      <div className="mining-balance-display">
        <div className="mining-digits-row">
          <span className="main-digits">
            {intPart}.{prefixDec}
          </span>
          <span className="micro-digits">{tailDec}</span>
          <span className="currency-usdt">USDT</span>
        </div>

        {isMiningActive ? (
          <button
            type="button"
            className={`btn-claim-compact ${isClaimReady ? 'btn-claim-ready' : 'btn-claim-locked'}`}
            onClick={onClaim}
            disabled={isClaiming || !isClaimReady}
            title={
              !isClaimReady
                ? (lang === 'bn'
                    ? `নূন্যতম ক্লেইম $${minClaimAmount} USDT (বর্তমানে মাইন্ড হয়েছে: $${formatMiningNumber(minedBalance, 4)} USDT)`
                    : `Minimum claim is $${minClaimAmount} USDT (Currently: $${formatMiningNumber(minedBalance, 4)} USDT)`)
                : (lang === 'bn'
                    ? `$${formatMiningNumber(minedBalance, 4)} USDT মেইন ব্যালেন্সে ট্রান্সফার করুন`
                    : `Claim $${formatMiningNumber(minedBalance, 4)} USDT to Main Wallet`)
            }
          >
            {isClaiming ? (
              <>
                <Loader2 size={13} className="claim-spinner" color="#ffffff" strokeWidth={2.5} />
                <span>Claiming</span>
              </>
            ) : (
              <>
                <span>Claim</span>
                <ArrowRight size={13} color="#ffffff" strokeWidth={2.5} />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            className={`btn-claim-compact btn-mining-start ${miningStatus === 'completed' ? 'btn-ready-pulse' : ''}`}
            onClick={onStartMining}
            title={miningStatus === 'completed' ? 'Start next 24-hour mining cycle' : 'Start 24-hour mining cycle'}
          >
            <Play size={12} fill="#ffffff" color="#ffffff" strokeWidth={2.2} />
            <span>Start</span>
          </button>
        )}
      </div>

      {/* 4. 3-Column Stats Row with Dividers */}
      <div className="mining-three-stats">
        {/* Column 1: Daily Earning */}
        <div className="stat-col">
          <div className="stat-icon-wrap">
            <TrendingUp size={16} color="#00b074" strokeWidth={2.4} />
          </div>
          <span className="stat-label">Daily Earning</span>
          <span className="stat-value green">
            +{dailyEarning || activePlan?.dailyEst || '0.05 USDT'}
          </span>
        </div>

        {/* Column 2: Mining Speed */}
        <div className="stat-col">
          <div className="stat-icon-wrap">
            <Zap size={16} color="#00b074" strokeWidth={2.4} />
          </div>
          <span className="stat-label">Mining Speed</span>
          <span className="stat-value blue">
            {miningSpeed || activePlan?.hashrate || '1.22 GH/s'}
          </span>
        </div>

        {/* Column 3: Deposit Balance */}
        <div className="stat-col">
          <div className="stat-icon-wrap">
            <Coins size={16} color="#00b074" strokeWidth={2.4} />
          </div>
          <span className="stat-label">
            {lang === 'bn' ? 'ডিপোজিট ব্যালেন্স' : 'Deposit Balance'}
          </span>
          <span className="stat-value green">
            {Number(depositBalance !== undefined ? depositBalance : totalInvestment || 0).toFixed(2)} USDT
          </span>
        </div>
      </div>
    </section>
  );
};
