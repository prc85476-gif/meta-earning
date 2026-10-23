import React from 'react';
import { 
  Zap, 
  Flame, 
  Shield, 
  Rocket, 
  Award, 
  Gem, 
  Crown, 
  ArrowRight, 
  TrendingUp, 
  Coins, 
  Percent, 
  CheckCircle2 
} from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export const DEPOSIT_PLANS = [
  {
    id: 'plan_3',
    name: 'Starter Power',
    price: 3,
    dailyProfit: 0.30,
    dailyRate: '10.0%',
    durationDays: 30,
    totalProfit: 9.00,
    hashrate: '5.0 GH/s',
    icon: Zap,
    badgeBg: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.22)',
    tag: 'STARTER CHOICE',
    tagBn: 'সহজ শুরু',
    roi: '300%',
    powerFill: 25,
    features: ['Auto Payout', '100% Safe', '300% ROI'],
    featuresBn: ['অটো পেআউট', '১০০% নিরাপদ', '৩০০% রিটার্ন']
  },
  {
    id: 'plan_5',
    name: 'Basic Turbo',
    price: 5,
    dailyProfit: 0.55,
    dailyRate: '11.0%',
    durationDays: 30,
    totalProfit: 16.50,
    hashrate: '10.0 GH/s',
    icon: Flame,
    badgeBg: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.22)',
    tag: 'MOST POPULAR',
    tagBn: 'জনপ্রিয় চয়েস',
    roi: '330%',
    powerFill: 42,
    features: ['Instant Node', 'High Yield', '330% ROI'],
    featuresBn: ['ইনস্ট্যান্ট নোড', 'উচ্চ আয়', '৩৩০% রিটার্ন']
  },
  {
    id: 'plan_20',
    name: 'Silver Booster',
    price: 20,
    dailyProfit: 2.40,
    dailyRate: '12.0%',
    durationDays: 30,
    totalProfit: 72.00,
    hashrate: '45.0 GH/s',
    icon: Shield,
    badgeBg: '#2563eb',
    glowColor: 'rgba(37, 99, 235, 0.22)',
    tag: 'SPEED BOOSTER',
    tagBn: 'হাই স্পিড',
    roi: '360%',
    powerFill: 60,
    features: ['Turbo GH/s', 'Zero Gas Fee', '360% ROI'],
    featuresBn: ['টার্বো স্পিড', 'জিরো ফি', '৩৬০% রিটার্ন']
  },
  {
    id: 'plan_50',
    name: 'Gold Mining Ultra',
    price: 50,
    dailyProfit: 6.50,
    dailyRate: '13.0%',
    durationDays: 30,
    totalProfit: 195.00,
    hashrate: '120.0 GH/s',
    icon: Rocket,
    badgeBg: '#7c3aed',
    glowColor: 'rgba(124, 58, 237, 0.24)',
    tag: 'BEST VALUE',
    tagBn: 'সেরা ভ্যালু',
    roi: '390%',
    powerFill: 75,
    features: ['Cloud Cluster', 'VIP Server', '390% ROI'],
    featuresBn: ['ক্লাউড কোর', 'ভিআইপি সার্ভার', '৩৯০% রিটার্ন']
  },
  {
    id: 'plan_100',
    name: 'Platinum Hashrate',
    price: 100,
    dailyProfit: 14.00,
    dailyRate: '14.0%',
    durationDays: 30,
    totalProfit: 420.00,
    hashrate: '280.0 GH/s',
    icon: Award,
    badgeBg: '#0891b2',
    glowColor: 'rgba(8, 145, 178, 0.24)',
    tag: 'VIP PRO',
    tagBn: 'ভিআইপি প্রো',
    roi: '420%',
    powerFill: 85,
    features: ['Dedicated Rig', 'Max Speed', '420% ROI'],
    featuresBn: ['ডেডিকেটেড রিগ', 'সর্বোচ্চ স্পিড', '৪২০% রিটার্ন']
  },
  {
    id: 'plan_200',
    name: 'Diamond Master',
    price: 200,
    dailyProfit: 30.00,
    dailyRate: '15.0%',
    durationDays: 30,
    totalProfit: 900.00,
    hashrate: '650.0 GH/s',
    icon: Gem,
    badgeBg: '#db2777',
    glowColor: 'rgba(219, 39, 119, 0.24)',
    tag: 'SUPER YIELD',
    tagBn: 'সুপার রিটার্ন',
    roi: '450%',
    powerFill: 92,
    features: ['Quantum ASIC', 'Priority Cashout', '450% ROI'],
    featuresBn: ['অ্যাসিক মাইনার', 'ফার্স্ট ক্যাশআউট', '৪৫০% রিটার্ন']
  },
  {
    id: 'plan_500',
    name: 'VIP Elite Legend',
    price: 500,
    dailyProfit: 85.00,
    dailyRate: '17.0%',
    durationDays: 30,
    totalProfit: 2550.00,
    hashrate: '1,800.0 GH/s',
    icon: Crown,
    badgeBg: '#d97706',
    glowColor: 'rgba(217, 119, 6, 0.26)',
    tag: 'WHALE EXCLUSIVE',
    tagBn: 'হোয়েল স্পেশাল',
    roi: '510%',
    powerFill: 100,
    features: ['Enterprise Pool', 'Instant VIP', '510% ROI'],
    featuresBn: ['ক্লাস্টার সার্ভার', 'ইনস্ট্যান্ট ভিআইপি', '৫১০% রিটার্ন']
  }
];

export const DepositPlansSection = ({ onSelectPlan, lang, purchasedPlanIds = [] }) => {
  const handlePlanClick = (plan) => {
    triggerHaptic('medium');
    if (onSelectPlan) {
      onSelectPlan(plan);
    }
  };

  // Once a user buys a plan, it is removed from the list, and the next plan appears!
  const availablePlans = DEPOSIT_PLANS.filter((plan) => !purchasedPlanIds.includes(plan.id));

  return (
    <div className="deposit-plans-container">
      {/* Section Header */}
      <div className="deposit-plans-header">
        <div className="deposit-plans-title-wrap">
          <h3 className="deposit-plans-title">
            {lang === 'bn' ? 'মাইনিং পাওয়ার প্ল্যান' : 'Mining Plan'}
          </h3>
          <span className="plans-active-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Zap size={13} color="#f59e0b" />
            {lang === 'bn' ? 'লাইভ মাইনিং বুস্ট' : 'Live Mining Boost'}
          </span>
        </div>
      </div>

      {availablePlans.length === 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.08))',
          border: '1.5px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '16px',
          padding: '28px 20px',
          textAlign: 'center',
          backdropFilter: 'blur(8px)'
        }}>
          <Crown size={38} color="#f59e0b" style={{ margin: '0 auto 10px auto' }} />
          <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <CheckCircle2 size={18} color="#10b981" />
            {lang === 'bn' ? 'সবগুলো প্ল্যান সফলভাবে অ্যাক্টিভ হয়েছে!' : 'All Power Plans Activated!'}
          </h4>
          <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
            {lang === 'bn' 
              ? 'আপনি বর্তমানে সর্বোচ্চ ক্লাস্টার স্পিডে প্রতিদিন সর্বোচ্চ প্রফিট মাইনিং করছেন।' 
              : 'You are currently mining at maximum cluster speed with all upgrades active.'}
          </p>
        </div>
      ) : (
        /* Plans List */
        <div className="deposit-plans-list">
          {availablePlans.map((plan, index) => {
            const IconComp = plan.icon;
            const isNextUpgrade = index === 0;
            return (
              <div 
                key={plan.id} 
                className="deposit-plan-item-card"
                style={{
                  '--plan-color': plan.badgeBg,
                  '--plan-glow': plan.glowColor
                }}
              >
                {/* Ambient Blurred Color Sphere */}
                <div 
                  className="plan-ambient-blur" 
                  style={{ background: plan.badgeBg }} 
                  aria-hidden="true"
                />

                {/* Card Top: Left Label + Badge, Right Circular Icon Badge */}
                <div className="plan-item-top">
                  <div className="plan-card-tag-wrap">
                    <div className="plan-card-badge-row">
                      <span className="plan-card-tag">{plan.name}</span>
                      {isNextUpgrade ? (
                        <span 
                          className="plan-recommend-pill" 
                          style={{ 
                            color: '#00b074', 
                            borderColor: 'rgba(0, 176, 116, 0.45)',
                            background: 'rgba(0, 176, 116, 0.12)',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <Zap size={11} color="#00b074" />
                          {lang === 'bn' ? 'পরবর্তী আপগ্রেড' : 'NEXT UPGRADE'}
                        </span>
                      ) : plan.tag && (
                        <span 
                          className="plan-recommend-pill" 
                          style={{ 
                            color: plan.badgeBg, 
                            borderColor: `${plan.badgeBg}40`,
                            background: `${plan.badgeBg}14`
                          }}
                        >
                          {lang === 'bn' ? plan.tagBn : plan.tag}
                        </span>
                      )}
                    </div>
                  <span className="plan-card-subtag">
                    <span className="plan-live-dot" style={{ background: plan.badgeBg }} />
                    {plan.hashrate} • {lang === 'bn' ? '৩০ দিন মেয়াদ' : '30 Days Duration'}
                  </span>
                </div>

                <div 
                  className="plan-card-circle-icon" 
                  style={{ 
                    background: `linear-gradient(135deg, ${plan.badgeBg}, ${plan.badgeBg}dd)`,
                    boxShadow: `0 4px 14px ${plan.badgeBg}45`
                  }}
                  title={plan.name}
                >
                  <IconComp size={18} color="#ffffff" strokeWidth={2.4} />
                </div>
              </div>

              {/* Big Bold USDT Amount and Action Button */}
              <div className="plan-card-main-row">
                <div className="plan-card-price-wrap">
                  <div className="plan-card-big-num">
                    ${plan.price}
                    <span className="plan-card-currency">USDT</span>
                  </div>
                  <span className="plan-card-muted-sub">
                    {lang === 'bn' ? 'দৈনিক রিটার্ন' : 'Daily Profit'}: <strong className="plan-daily-highlight">+{plan.dailyProfit.toFixed(2)} USDT</strong>
                  </span>
                </div>

                <button
                  type="button"
                  className="btn-buy-plan"
                  onClick={() => handlePlanClick(plan)}
                >
                  <span>{lang === 'bn' ? `কিনুন $${plan.price}` : `Buy $${plan.price}`}</span>
                  <ArrowRight size={13} strokeWidth={2.5} />
                </button>
              </div>

              {/* Middle Section: Feature Badges */}
              <div className="plan-card-middle-content">
                {/* Glassmorphism Feature Badges */}
                <div className="plan-chips-row">
                  {(lang === 'bn' ? plan.featuresBn : plan.features).map((feat, idx) => (
                    <span key={idx} className="plan-glass-chip">
                      <CheckCircle2 size={10} color={plan.badgeBg} strokeWidth={2.6} />
                      {feat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats Grid with Frosted Glass & Icons */}
              <div className="plan-stats-grid">
                <div className="plan-stat-cell">
                  <div className="plan-stat-header">
                    <TrendingUp size={11} color="#00b074" />
                    <span className="plan-stat-lbl">
                      {lang === 'bn' ? 'প্রতিদিন আয়' : 'Daily Income'}
                    </span>
                  </div>
                  <div className="plan-stat-val text-green">
                    +{plan.dailyProfit.toFixed(2)} USDT
                  </div>
                </div>

                <div className="plan-stat-cell">
                  <div className="plan-stat-header">
                    <Coins size={11} color="#0f172a" />
                    <span className="plan-stat-lbl">
                      {lang === 'bn' ? '৩০ দিনে মোট' : '30-Day Return'}
                    </span>
                  </div>
                  <div className="plan-stat-val text-dark">
                    {plan.totalProfit.toFixed(2)} USDT
                  </div>
                </div>

                <div className="plan-stat-cell">
                  <div className="plan-stat-header">
                    <Percent size={11} color="#2563eb" />
                    <span className="plan-stat-lbl">
                      {lang === 'bn' ? 'দৈনিক হার' : 'Daily Rate'}
                    </span>
                  </div>
                  <div className="plan-stat-val text-blue">
                    {plan.dailyRate}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
};


