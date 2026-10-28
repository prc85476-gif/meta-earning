import React from 'react';
import { Clock, Pickaxe, ArrowDownToLine, Users, ChevronRight, ArrowRight, ArrowUpFromLine } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export const RecentActivity = ({ activities = [], onViewAll, lang, title }) => {
  const defaultActivities = [
    {
      id: '1',
      type: 'mining',
      title: 'Mining Reward',
      subtitle: 'Daily mining income',
      amount: '+0.000122 USDT',
      time: 'Today, 10:24 AM'
    },
    {
      id: '2',
      type: 'deposit',
      title: 'Deposit',
      subtitle: 'USDT deposit completed',
      amount: '+5.000000 USDT',
      time: 'Yesterday, 03:15 PM'
    },
    {
      id: '3',
      type: 'referral',
      title: 'Referral Bonus',
      subtitle: 'From your friend',
      amount: '+0.010000 USDT',
      time: 'Yesterday, 11:42 AM'
    }
  ];

  const items = activities && activities.length > 0 ? activities.slice(0, 5) : defaultActivities;

  const getIconConfig = (type) => {
    switch (type) {
      case 'mining':
      case 'claim':
        return {
          bg: '#10b981',
          icon: <Pickaxe size={17} color="#ffffff" strokeWidth={2.4} />
        };
      case 'deposit':
        return {
          bg: '#3b82f6',
          icon: <ArrowDownToLine size={17} color="#ffffff" strokeWidth={2.4} />
        };
      case 'withdraw':
        return {
          bg: '#f59e0b',
          icon: <ArrowUpFromLine size={17} color="#ffffff" strokeWidth={2.4} />
        };
      case 'referral':
      default:
        return {
          bg: '#8b5cf6',
          icon: <Users size={17} color="#ffffff" strokeWidth={2.4} />
        };
    }
  };

  const handleItemClick = () => {
    triggerHaptic('light');
  };

  return (
    <div className="recent-activity-card">
      {/* Header */}
      <div className="activity-header">
        <div className="activity-title-wrap">
          <div className="activity-clock-icon">
            <Clock size={15} color="#ffffff" strokeWidth={2.4} />
          </div>
          <span className="activity-title">
            {title || 'Recent Account History'}
          </span>
        </div>
        <button
          type="button"
          className="btn-view-all"
          onClick={() => {
            triggerHaptic('light');
            if (onViewAll) onViewAll();
          }}
        >
          <span>View All</span>
          <ArrowRight size={13} strokeWidth={2.2} />
        </button>
      </div>

      {/* Activity Items List */}
      <div className="activity-list">
        {items.map((item, index) => {
          const config = getIconConfig(item.type);
          return (
            <div
              key={item.id || index}
              className="activity-item"
              onClick={handleItemClick}
            >
              {/* Left: Circle Icon */}
              <div
                className="activity-icon-badge"
                style={{ backgroundColor: config.bg }}
              >
                {config.icon}
              </div>

              {/* Middle: Title & Subtitle */}
              <div className="activity-info">
                <span className="activity-name">{item.title}</span>
                <span className="activity-desc">{item.subtitle}</span>
              </div>

              {/* Right: Amount, Status & Time */}
              <div className="activity-meta">
                <span className={`activity-amount ${item.type === 'withdraw' ? 'withdraw' : ''}`}>
                  {item.amount}
                </span>
                {item.status && (
                  <span className={`activity-status-tag ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                )}
                <span className="activity-time">{item.time}</span>
              </div>

              {/* Chevron Arrow */}
              <div className="activity-arrow">
                <ChevronRight size={16} color="#94a3b8" strokeWidth={2.2} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
