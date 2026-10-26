import React, { useState } from 'react';
import { 
  Users, 
  Copy, 
  Check, 
  Share2, 
  Coins, 
  Zap, 
  Sparkles,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  DollarSign,
  User
} from 'lucide-react';
import { translations, copyToClipboard, formatUSDT } from '../utils/formatters';
import { triggerHaptic, getTelegramWebApp } from '../utils/telegram';

export const FriendsTab = ({ 
  user, 
  lang, 
  totalReferralBonus = 0.00,
  referralList = []
}) => {
  const t = translations[lang] || translations.en;
  const [copied, setCopied] = useState(false);

  const botUsername = 'Meta_Farming_bot';
  const refCode = user?.id || '987654321';
  const referralLink = `https://t.me/${botUsername}?start=${refCode}`;

  const handleCopyLink = async () => {
    triggerHaptic('success');
    const ok = await copyToClipboard(referralLink);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareTelegram = () => {
    triggerHaptic('medium');
    const shareText = encodeURIComponent(
      lang === 'bn' 
        ? `আমি USDT Power Plan-এ জয়েন করে ফ্রি ইউএসডিটি মাইনিং করছি! তুমিও জয়েন করে ডেইলি রিওয়ার্ড আয় করো: ${referralLink}`
        : `Start free USDT mining on Telegram with USDT Power Plan! Join now: ${referralLink}`
    );
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`;
    
    const tg = getTelegramWebApp();
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink(tgUrl);
    } else {
      window.open(tgUrl, '_blank');
    }
  };

  return (
    <div className="ref-page-container">
      {/* 1. TOP 2 STATS BOXES: TOTAL REFER & TOTAL COMMISSION */}
      <div className="ref-stats-grid">
        {/* Box 1: Total Refer */}
        <div className="ref-stat-box blue">
          <div className="ref-stat-header">
            <div className="ref-stat-icon-wrap">
              <Users size={17} strokeWidth={2.4} />
            </div>
            <span className="ref-stat-badge-tag">
              {lang === 'bn' ? 'সক্রিয় মেম্বার' : 'Active'}
            </span>
          </div>
          <div className="ref-stat-info">
            <span className="ref-stat-lbl">
              {lang === 'bn' ? 'মোট রেফার' : 'Total Refer'}
            </span>
            <span className="ref-stat-val">
              {referralList.length} {lang === 'bn' ? 'জন' : 'Users'}
            </span>
          </div>
        </div>

        {/* Box 2: Total Commission */}
        <div className="ref-stat-box green">
          <div className="ref-stat-header">
            <div className="ref-stat-icon-wrap">
              <Coins size={17} strokeWidth={2.4} />
            </div>
            <span className="ref-stat-badge-tag">
              {lang === 'bn' ? '১০% ক্যাশব্যাক' : '10% Cash'}
            </span>
          </div>
          <div className="ref-stat-info">
            <span className="ref-stat-lbl">
              {lang === 'bn' ? 'মোট কমিশন' : 'Total Commission'}
            </span>
            <span className="ref-stat-val">
              +{formatUSDT(totalReferralBonus)} USDT
            </span>
          </div>
        </div>
      </div>

      {/* 3. HOW IT WORKS - 3 COLORFUL STEP BOXES */}
      <div className="ref-steps-section">
        <div className="ref-steps-title-row">
          <span className="ref-steps-heading">
            <Sparkles size={16} color="#f59e0b" />
            {lang === 'bn' ? 'কিভাবে কাজ করে (৩টি সহজ ধাপ)' : 'How It Works (3 Easy Steps)'}
          </span>
          <span className="ref-steps-reward-tag">
            {lang === 'bn' ? '১০% লাইফটাইম' : '10% Lifetime'}
          </span>
        </div>

        {/* Step 1: Purple Box */}
        <div className="ref-step-card purple">
          <div className="ref-step-number-pill">01</div>
          <div className="ref-step-content">
            <div className="ref-step-title">
              {lang === 'bn' ? '১. ইনভাইট লিংক শেয়ার করুন' : '1. Share Your Invite Link'}
            </div>
            <div className="ref-step-desc">
              {lang === 'bn'
                ? 'আপনার নিজস্ব ইউনিক রেফার লিংক বন্ধুদের বা টেলিগ্রাম গ্রুপে শেয়ার করুন।'
                : 'Send your personal referral link to your friends or share in Telegram groups.'}
            </div>
          </div>
        </div>

        {/* Step 2: Blue Box */}
        <div className="ref-step-card blue">
          <div className="ref-step-number-pill">02</div>
          <div className="ref-step-content">
            <div className="ref-step-title">
              {lang === 'bn' ? '২. বন্ধু জয়েন করে মাইনিং শুরু করবে' : '2. Friend Joins & Starts Mining'}
            </div>
            <div className="ref-step-desc">
              {lang === 'bn'
                ? 'আপনার লিংকে বন্ধু অ্যাকাউন্ট খুলে ফ্রি ইউএসডিটি মাইনিং চালু করবে।'
                : 'Your friend registers via your link and activates free USDT mining instantly.'}
            </div>
          </div>
        </div>

        {/* Step 3: Emerald Green Box */}
        <div className="ref-step-card emerald">
          <div className="ref-step-number-pill">03</div>
          <div className="ref-step-content">
            <div className="ref-step-title">
              {lang === 'bn' ? '৩. ফ্রেন্ড ডিপোজিট করলেই আপনার ১০% রিওয়ার্ড' : '3. Friend Deposits, You Get 10%'}
            </div>
            <div className="ref-step-desc">
              {lang === 'bn'
                ? 'আপনার বন্ধু ডিপোজিট করে যেকোনো প্ল্যান নিলেই ১০% ক্যাশ কমিশন সরাসরি আপনার মেইন ব্যালেন্সে জমা হবে এবং সাথে সাথে উইথড্র করতে পারবেন!'
                : 'Whenever your friend deposits or upgrades any mining power plan, you instantly receive 10% cash reward directly to your withdrawable balance!'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. REFERRAL LINK & TELEGRAM SHARE */}
      <div className="ref-link-card">
        <div className="ref-link-label-row">
          <span className="ref-link-lbl">
            {lang === 'bn' ? 'আপনার পার্সোনাল রেফারাল লিংক' : 'Your Personal Referral Link'}
          </span>
        </div>

        <div className="ref-link-input-wrap">
          <span className="ref-link-text">
            {referralLink}
          </span>
          <button
            type="button"
            className="btn-ref-copy"
            onClick={handleCopyLink}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? (lang === 'bn' ? 'কপি হয়েছে' : 'Copied') : (lang === 'bn' ? 'কপি' : 'Copy')}</span>
          </button>
        </div>

        <button
          type="button"
          className="btn-ref-share-tg"
          onClick={handleShareTelegram}
        >
          <Share2 size={16} />
          <span>{lang === 'bn' ? 'টেলিগ্রামে বন্ধুদের শেয়ার করুন' : 'Share with Friends on Telegram'}</span>
        </button>
      </div>

      {/* 5. REFERRAL LIST SECTION */}
      <div className="ref-list-section">
        <div className="ref-list-header">
          <span className="ref-list-heading">
            {lang === 'bn' ? 'আপনার রেফারাল তালিকা' : 'Your Referral List'}
          </span>
          <span className="ref-list-count-badge">
            {referralList.length} {lang === 'bn' ? 'জন রেফার্ড' : 'Referred'}
          </span>
        </div>

        <div className="ref-friends-list">
          {referralList.length === 0 ? (
            <div className="ref-empty-state">
              <div className="ref-empty-icon-wrap">
                <Users size={28} color="#94a3b8" />
              </div>
              <span className="ref-empty-title">
                {lang === 'bn' ? 'কোনো রেফারেল পাওয়া যায়নি' : 'No Referrals Yet'}
              </span>
              <span className="ref-empty-sub">
                {lang === 'bn' 
                  ? 'আপনার রেফারেল লিংক শেয়ার করে বন্ধুদের ইনভাইট করুন।'
                  : 'Share your personal referral link to invite friends and earn rewards.'}
              </span>
            </div>
          ) : (
            referralList.map((friend) => (
              <div key={friend.id} className="ref-friend-item">
                <div className="ref-friend-left">
                  <div className="ref-tg-profile-pic">
                    {friend.photo_url ? (
                      <img 
                        src={friend.photo_url} 
                        alt={friend.name} 
                        className="ref-friend-img" 
                      />
                    ) : (
                      <div className="ref-tg-avatar-circle">
                        <User size={18} color="#ffffff" strokeWidth={2.4} />
                      </div>
                    )}
                  </div>
                  <div className="ref-friend-info">
                    <span className="ref-friend-name">{friend.name}</span>
                    <span className="ref-friend-sub">
                      <span>{friend.username}</span>
                      {friend.time && (
                        <>
                          <span>•</span>
                          <span>{lang === 'bn' ? (friend.timeBn || friend.time) : friend.time}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="ref-friend-right">
                  <span className={`ref-friend-reward ${friend.commission > 0 ? 'active' : 'zero'}`}>
                    {friend.commission > 0 ? `+${formatUSDT(friend.commission)} USDT` : '0 USDT'}
                  </span>
                  <span className={`ref-friend-status ${friend.hasDeposited ? 'deposited' : 'pending'}`}>
                    {friend.hasDeposited 
                      ? (lang === 'bn' ? `ডিপোজিট: $${friend.depositAmount}` : `Deposited: $${friend.depositAmount}`)
                      : (lang === 'bn' ? 'ডিপোজিট নেই' : 'No Deposit')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
