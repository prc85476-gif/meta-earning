import React from 'react';
import { Globe, X, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';

export const LanguageModal = ({ isOpen, onClose, currentLang, onSelectLang }) => {
  if (!isOpen) return null;

  const handleSelect = (code) => {
    triggerHaptic('selection');
    onSelectLang(code);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="modal-content language-modal-content" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="modal-icon-wrap" style={{ background: '#e6f7ef', color: '#00b074' }}>
              <Globe size={18} />
            </div>
            <div>
              <h3 className="modal-title" style={{ fontSize: '15px' }}>
                Select Language
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Choose language / ভাষা নির্বাচন করুন
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="btn-modal-close" 
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* 10 Languages List */}
        <div className="language-list-grid">
          {SUPPORTED_LANGUAGES.map((langItem) => {
            const isSelected = currentLang === langItem.code;
            return (
              <button
                key={langItem.code}
                type="button"
                className={`language-card-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(langItem.code)}
              >
                <div className="language-item-left">
                  <span className="language-flag">{langItem.flag}</span>
                  <div className="language-names">
                    <span className="language-native-name">{langItem.native}</span>
                    <span className="language-region-name">{langItem.region}</span>
                  </div>
                </div>

                {isSelected ? (
                  <div className="language-check-badge">
                    <Check size={14} strokeWidth={3} />
                  </div>
                ) : (
                  <span className="language-code-badge">{langItem.code.toUpperCase()}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
