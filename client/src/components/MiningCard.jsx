import React, { useState } from 'react';
import { TrendingUp, Zap, Coins, Wallet, ArrowRight, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { formatMiningNumber, formatUSDT } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';

export const MiningCard = ({
  minedBalance,
  activePlan,
  lang,
  onClaim,
  walletBalance,
  totalInvestment = 0.00,
  depositBalance,
  dailyEarning,
  miningSpeed
}) => {
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaimClick = () => {
    if (isClaiming || minedBalance <= 0.000001) return;
    triggerHaptic('medium');
    setIsClaiming(true);

    setTimeout(() => {
      onClaim();
      setIsClaiming(false);
      triggerHaptic('success');
      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.3 }
        });
      } catch (e) {}
    }, 1200);
  };

  const formattedMined = formatMiningNumber(minedBalance, 8);
  const dotIndex = formattedMined.indexOf('.');
  const intPart = dotIndex !== -1 ? formattedMined.substring(0, dotIndex) : formattedMined;
  const decPart = dotIndex !== -1 ? formattedMined.substring(dotIndex + 1) : '00000000';
  
  // First 6 decimals in dark navy, last 2 micro digits in bright green
  const prefixDec = decPart.substring(0, 6); // e.g. 000107
  const tailDec = decPart.substring(6);       // e.g. 05

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

      {/* 2. Mining Digits & Compact Claim Button */}
      <div className="mining-balance-display">
        <div className="mining-digits-row">
          <span className="main-digits">
            {intPart}.{prefixDec}
          </span>
          <span className="micro-digits">{tailDec}</span>
          <span className="currency-usdt">USDT</span>
        </div>

        <button
          type="button"
          className={`btn-claim-compact ${isClaiming ? 'claiming' : ''}`}
          onClick={handleClaimClick}
          disabled={isClaiming || minedBalance <= 0.000001}
          title={minedBalance <= 0.000001 ? "Mining in progress..." : "Claim to Wallet"}
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
      </div>

      {/* 3. 3-Column Stats Row with Dividers */}
      <div className="mining-three-stats">
        {/* Column 1: Daily Earning */}
        <div className="stat-col">
          <div className="stat-icon-wrap">
            <TrendingUp size={16} color="#00b074" strokeWidth={2.4} />
          </div>
          <span className="stat-label">Daily Earning</span>
          <span className="stat-value green">
            +{dailyEarning || activePlan?.dailyEst || '0.029 USDT'}
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
