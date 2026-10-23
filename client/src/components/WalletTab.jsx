import React from 'react';
import { Wallet, ArrowDownLeft, ArrowDownRight, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { translations, formatUSDT, formatMiningNumber } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';

export const WalletTab = ({
  walletBalance,
  minedBalance,
  transactions,
  lang,
  onOpenDeposit,
  onOpenWithdraw
}) => {
  const t = translations[lang];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wallet Balance Hero Card */}
      <div className="balance-hero-card">
        <div className="balance-hero-title">
          <Wallet size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {t.walletTitle}
        </div>
        <div className="balance-hero-val">
          {formatUSDT(walletBalance)} <span style={{ fontSize: '18px', fontWeight: 600, color: '#10b981' }}>USDT</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t.unclaimedMining}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
              {formatMiningNumber(minedBalance, 6)} USDT
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t.mainBalance}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
              ${formatUSDT(walletBalance)} USD
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons-grid">
        <button
          type="button"
          className="btn-action deposit-btn"
          onClick={() => {
            triggerHaptic('medium');
            onOpenDeposit();
          }}
        >
          <div className="action-icon-circle">
            <ArrowDownLeft size={17} strokeWidth={2.4} />
          </div>
          <div className="action-text-group">
            <span className="action-sub-text">{t.depositSub}</span>
            <span className="action-main-title">{t.deposit}</span>
          </div>
        </button>

        <button
          type="button"
          className="btn-action withdraw-btn"
          onClick={() => {
            triggerHaptic('medium');
            onOpenWithdraw();
          }}
        >
          <div className="action-icon-circle">
            <ArrowDownRight size={17} strokeWidth={2.4} />
          </div>
          <div className="action-text-group">
            <span className="action-sub-text">{t.withdrawSub}</span>
            <span className="action-main-title">{t.withdraw}</span>
          </div>
        </button>
      </div>

      {/* Transactions History */}
      <div className="history-card">
        <div className="overview-header">
          <span className="overview-title">
            <Clock size={15} color="#2563eb" />
            {t.transactions}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {transactions.length} Records
          </span>
        </div>

        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '13px' }}>
            {t.noHistory}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {transactions.map((tx, idx) => (
              <div key={idx} className="history-item">
                <div className="history-left">
                  <div className="history-icon" style={{
                    background: tx.type === 'deposit' ? '#ecfdf5' : tx.type === 'withdraw' ? '#eff6ff' : '#fef3c7',
                    color: tx.type === 'deposit' ? '#10b981' : tx.type === 'withdraw' ? '#2563eb' : '#f59e0b'
                  }}>
                    {tx.type === 'deposit' ? <ArrowDownLeft size={18} /> : tx.type === 'withdraw' ? <ArrowDownRight size={18} /> : <TrendingUp size={18} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                      {tx.type === 'deposit' ? t.deposit : tx.type === 'withdraw' ? t.withdraw : t.claim}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {tx.date} • {tx.network || 'Internal'}
                    </div>
                  </div>
                </div>

                <div className="history-right">
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: tx.type === 'deposit' || tx.type === 'claim' ? '#10b981' : '#2563eb'
                  }}>
                    {tx.type === 'withdraw' ? '-' : '+'}{formatUSDT(tx.amount)} USDT
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#10b981'
                  }}>
                    <CheckCircle2 size={10} />
                    {tx.status || 'Completed'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
