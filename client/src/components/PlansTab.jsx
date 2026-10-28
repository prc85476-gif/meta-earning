import React from 'react';
import { Cpu, Zap, Check, ArrowRight } from 'lucide-react';
import { translations, formatUSDT } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';

export const PLANS_DATA = [
  {
    id: 'starter',
    name: 'Starter Plan (Free)',
    price: 0,
    hourlyRate: '0.00122',
    hashrate: '1.22 GH/s',
    dailyEst: '0.05 USDT',
    badgeColor: '#10b981'
  },
  {
    id: 'bronze',
    name: 'Bronze Power Plan',
    price: 15,
    hourlyRate: '0.02500',
    hashrate: '25.0 GH/s',
    dailyEst: '0.60 USDT',
    badgeColor: '#f59e0b'
  },
  {
    id: 'silver',
    name: 'Silver Power Plan',
    price: 50,
    hourlyRate: '0.09500',
    hashrate: '95.0 GH/s',
    dailyEst: '2.28 USDT',
    badgeColor: '#3b82f6'
  },
  {
    id: 'gold',
    name: 'Gold Turbo Plan',
    price: 150,
    hourlyRate: '0.32000',
    hashrate: '320.0 GH/s',
    dailyEst: '7.68 USDT',
    badgeColor: '#8b5cf6'
  },
  {
    id: 'diamond',
    name: 'VIP Diamond Plan',
    price: 500,
    hourlyRate: '1.25000',
    hashrate: '1,250 GH/s',
    dailyEst: '30.00 USDT',
    badgeColor: '#ec4899'
  }
];

export const PlansTab = ({ activePlan, onSelectPlan, walletBalance, lang, onOpenDeposit }) => {
  const t = translations[lang];

  const handleBuy = (plan) => {
    triggerHaptic('medium');
    if (walletBalance < plan.price) {
      triggerHaptic('warning');
      onOpenDeposit();
      return;
    }
    onSelectPlan(plan);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ textAlign: 'center', margin: '4px 0 10px 0' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          {t.plansTitle}
        </h3>
        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
          {t.plansSubtitle}
        </p>
      </div>

      <div className="plans-list">
        {PLANS_DATA.map((plan) => {
          const isActive = activePlan.id === plan.id;
          const canAfford = walletBalance >= plan.price;

          return (
            <div
              key={plan.id}
              className={`plan-card ${isActive ? 'active-plan' : ''}`}
            >
              <div className="plan-info">
                <div className="plan-name">
                  <Zap size={15} color={plan.badgeColor} fill={plan.badgeColor} />
                  <span>{plan.name}</span>
                </div>
                <div className="plan-rate">
                  +{plan.hourlyRate} USDT / hr
                </div>
                <div className="plan-cost">
                  {plan.price === 0 ? (
                    <span style={{ color: '#10b981', fontWeight: 700 }}>Free / Lifetime Free</span>
                  ) : (
                    <span>Price: <strong>{formatUSDT(plan.price)} USDT</strong> ({plan.dailyEst}/day)</span>
                  )}
                </div>
              </div>

              <div>
                {isActive ? (
                  <button type="button" className="plan-action-btn active">
                    <Check size={14} style={{ display: 'inline', marginRight: 4 }} />
                    {t.activePlan}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="plan-action-btn buy"
                    onClick={() => handleBuy(plan)}
                  >
                    {canAfford ? t.upgrade : (t.deposit || 'Deposit')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
