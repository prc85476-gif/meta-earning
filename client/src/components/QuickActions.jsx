import React from 'react';
import { ArrowDownLeft, ArrowDownRight } from 'lucide-react';
import { translations } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';

export const QuickActions = ({ lang, onOpenDeposit, onOpenWithdraw }) => {
  const t = translations[lang];

  const handleDepositClick = () => {
    triggerHaptic('medium');
    onOpenDeposit();
  };

  const handleWithdrawClick = () => {
    triggerHaptic('medium');
    onOpenWithdraw();
  };

  return (
    <section className="action-buttons-grid" aria-label="Deposit and Withdraw Actions">
      {/* Deposit Button */}
      <button
        type="button"
        className="btn-action deposit-btn"
        onClick={handleDepositClick}
      >
        <div className="action-icon-circle">
          <ArrowDownLeft size={17} strokeWidth={2.4} />
        </div>
        <div className="action-text-group">
          <span className="action-sub-text">{t.depositSub}</span>
          <span className="action-main-title">{t.deposit}</span>
        </div>
      </button>

      {/* Withdraw Button */}
      <button
        type="button"
        className="btn-action withdraw-btn"
        onClick={handleWithdrawClick}
      >
        <div className="action-icon-circle">
          <ArrowDownRight size={17} strokeWidth={2.4} />
        </div>
        <div className="action-text-group">
          <span className="action-sub-text">{t.withdrawSub}</span>
          <span className="action-main-title">{t.withdraw}</span>
        </div>
      </button>
    </section>
  );
};
