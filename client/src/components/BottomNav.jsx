import React from 'react';
import { Pickaxe, Users, User } from 'lucide-react';
import { translations } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';

export const BottomNav = ({ currentTab, onTabChange, lang }) => {
  const t = translations[lang];

  const tabs = [
    { id: 'mining', label: t.tabMining, icon: Pickaxe },
    { id: 'friends', label: t.tabFriends, icon: Users },
    { id: 'profile', label: t.tabProfile, icon: User }
  ];

  const handleSelect = (tabId) => {
    triggerHaptic('light');
    onTabChange(tabId);
  };

  return (
    <nav className="bottom-nav" aria-label="Bottom Navigation">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => handleSelect(tab.id)}
            aria-label={tab.label}
          >
            <div className="nav-icon-wrap">
              <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
            </div>
            <span className="nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
