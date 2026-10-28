import React, { useState } from 'react';
import { 
  User, 
  MessageCircle, 
  ExternalLink, 
  Globe, 
  Coins, 
  ArrowUpFromLine, 
  CheckCircle2, 
  Copy, 
  Check,
  Send,
  ShieldCheck 
} from 'lucide-react';
import { translations, SUPPORTED_LANGUAGES, formatUSDT, copyToClipboard } from '../utils/formatters';
import { triggerHaptic, getTelegramWebApp } from '../utils/telegram';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';

export const ProfileTab = ({ 
  user, 
  activePlan, 
  lang, 
  totalInvestment = 0,
  depositBalance = 0,
  totalWithdraw = 0,
  activities = [],
  onOpenDeposit,
  onOpenWithdraw,
  onOpenLanguage 
}) => {
  const t = translations[lang] || translations.en;
  const [copiedUid, setCopiedUid] = useState(false);

  const handleCopyUid = async () => {
    triggerHaptic('light');
    const ok = await copyToClipboard(user?.id || '987654321');
    if (ok) {
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const handleSupportClick = (customUrl = 'https://t.me/telegram') => {
    triggerHaptic('medium');
    const targetUrl = customUrl || 'https://t.me/telegram';
    const tg = getTelegramWebApp();
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink(targetUrl);
    } else {
      window.open(targetUrl, '_blank');
    }
  };

  const effectiveInvested = depositBalance !== undefined && depositBalance > 0 
    ? depositBalance 
    : (totalInvestment || 0);

  return (
    <div className="profile-container">
      {/* 1. TOP TELEGRAM PROFILE CARD */}
      <div className="profile-user-card">
        <div className="profile-user-top">
          <div className="profile-avatar">
            {user?.photo_url ? (
              <img 
                src={user.photo_url} 
                alt={user?.first_name || 'Profile'} 
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
              />
            ) : (
              <span style={{ fontWeight: 800 }}>
                {user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'M'}
              </span>
            )}
          </div>
          <div className="profile-user-details">
            <div className="profile-user-name-row">
              <h3 className="profile-user-name">
                {user?.first_name || 'Mining User'} {user?.last_name || ''}
              </h3>
              <span className="profile-badge-verified">
                <CheckCircle2 size={12} />
                <span>Verified</span>
              </span>
            </div>
            <span className="profile-user-handle">
              {user?.username ? `@${user.username}` : (user?.first_name ? `@${user.first_name.toLowerCase().replace(/\s+/g, '')}` : '@miner')}
            </span>
            <div 
              className="profile-uid-pill" 
              onClick={handleCopyUid} 
              title="Click to copy UID"
            >
              <span className="uid-lbl">UID:</span>
              <span className="uid-val">{user?.id || '987654321'}</span>
              {copiedUid ? <Check size={11} color="#059669" /> : <Copy size={11} color="#64748b" />}
            </div>
          </div>
        </div>
      </div>

      {/* 2. WITHDRAW & DEPOSIT OPTIONS (HOME PAGE STYLE) */}
      <QuickActions
        lang={lang}
        onOpenDeposit={onOpenDeposit}
        onOpenWithdraw={onOpenWithdraw}
      />

      {/* 2.5 OFFICIAL CHANNEL & PAYOUT REVIEW CHANNEL BUTTONS */}
      <section className="action-buttons-grid" aria-label="Official Telegram Channels">
        {/* Official Channel Button */}
        <button
          type="button"
          className="btn-action official-channel-btn"
          onClick={() => handleSupportClick('https://t.me/metafarmingnews')}
        >
          <div className="action-icon-circle">
            <Send size={16} strokeWidth={2.4} />
          </div>
          <div className="action-text-group">
            <span className="action-sub-text">Latest News</span>
            <span className="action-main-title">Official Channel</span>
          </div>
        </button>

        {/* Payout Review Channel Button */}
        <button
          type="button"
          className="btn-action payout-channel-btn"
          onClick={() => handleSupportClick('https://t.me/Meta_Farming_Payment_Proof')}
        >
          <div className="action-icon-circle">
            <ShieldCheck size={16} strokeWidth={2.4} />
          </div>
          <div className="action-text-group">
            <span className="action-sub-text">Payment Proof</span>
            <span className="action-main-title">Payout Review Channel</span>
          </div>
        </button>
      </section>

      {/* 3. TOTAL INVEST & TOTAL WITHDRAW BUTTONS/BOXES */}
      <div className="profile-stats-grid">
        {/* Box 1: Total Invest */}
        <div 
          className="profile-stat-box invest" 
          onClick={() => {
            triggerHaptic('light');
            if (onOpenDeposit) onOpenDeposit();
          }}
          title="Click to Deposit"
        >
          <div className="profile-stat-header">
            <div className="profile-stat-icon-wrap invest">
              <Coins size={16} strokeWidth={2.4} />
            </div>
            <span className="profile-stat-tag invest">
              Deposit
            </span>
          </div>
          <div className="profile-stat-info">
            <span className="profile-stat-lbl">
              Total Invest
            </span>
            <span className="profile-stat-val invest">
              ${formatUSDT(effectiveInvested)} USDT
            </span>
          </div>
        </div>

        {/* Box 2: Total Withdraw */}
        <div 
          className="profile-stat-box withdraw" 
          onClick={() => {
            triggerHaptic('light');
            if (onOpenWithdraw) onOpenWithdraw();
          }}
          title="Click to Withdraw"
        >
          <div className="profile-stat-header">
            <div className="profile-stat-icon-wrap withdraw">
              <ArrowUpFromLine size={16} strokeWidth={2.4} />
            </div>
            <span className="profile-stat-tag withdraw">
              Withdrawal
            </span>
          </div>
          <div className="profile-stat-info">
            <span className="profile-stat-lbl">
              Total Withdraw
            </span>
            <span className="profile-stat-val withdraw">
              ${formatUSDT(totalWithdraw || 0)} USDT
            </span>
          </div>
        </div>
      </div>

      {/* 4. RECENT ACCOUNT HISTORY BOX (HOME PAGE STYLE) */}
      <RecentActivity
        activities={activities}
        lang={lang}
        title="Recent Account History"
      />

      {/* 5. SETTINGS: LANGUAGE & SUPPORT */}
      <div className="profile-settings-card">
        <div 
          className="profile-setting-row" 
          onClick={() => {
            triggerHaptic('light');
            if (onOpenLanguage) onOpenLanguage();
          }}
        >
          <div className="setting-left">
            <Globe size={18} color="#0284c7" />
            <span>Language</span>
          </div>
          <div className="setting-right-btn">
            <span>{SUPPORTED_LANGUAGES.find(l => l.code === lang)?.native || 'English'}</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>▼</span>
          </div>
        </div>

        <div className="profile-setting-row" onClick={handleSupportClick}>
          <div className="setting-left">
            <MessageCircle size={18} color="#00b074" />
            <span>{t.support || 'Telegram Support'}</span>
          </div>
          <ExternalLink size={15} color="#94a3b8" />
        </div>
      </div>
    </div>
  );
};
