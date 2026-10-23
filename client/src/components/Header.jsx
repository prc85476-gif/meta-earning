import React from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export const Header = ({ user, activePlan, lang, onOpenLanguage, onRefresh }) => {
  const handleOpenLang = () => {
    triggerHaptic('light');
    if (onOpenLanguage) onOpenLanguage();
  };

  const handleRefresh = () => {
    triggerHaptic('light');
    if (onRefresh) onRefresh();
  };

  return (
    <header className="top-header">
      <div className="user-profile-badge">
        <div className="user-avatar-box">
          {user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div className="user-details">
          <span className="user-name">
            {user.first_name || 'USDT Miner'}
          </span>
          {user.username && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              @{user.username}
            </span>
          )}
        </div>
      </div>

      <div className="header-actions">
        <button 
          className="btn-icon-subtle btn-lang-selector" 
          onClick={handleOpenLang} 
          title="Select Language / ভাষা নির্বাচন করুন"
          aria-label="Select Language"
        >
          <Globe size={14} color="#0f172a" />
          <span style={{ fontSize: '11px', fontWeight: 800 }}>
            {lang ? lang.toUpperCase() : 'EN'}
          </span>
        </button>

        <button 
          className="btn-icon-subtle" 
          onClick={handleRefresh} 
          title="Refresh Balance"
          aria-label="Refresh Balance"
        >
          <RefreshCw size={15} />
        </button>
      </div>
    </header>
  );
};
