import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowUpFromLine, AlertCircle, Clock, Lightbulb, Lock, ShieldCheck, Check } from 'lucide-react';
import { translations, formatUSDT } from '../utils/formatters';
import { triggerHaptic } from '../utils/telegram';
import usdtLogo from '../assets/usdt-bep20-logo.jpg';

export const WithdrawModal = ({
  isOpen,
  onClose,
  walletBalance,
  onWithdrawSubmit,
  lang
}) => {
  const t = translations[lang] || translations.en;
  const dialogRef = useRef(null);

  // Retrieve locked address from localStorage if previously set
  const savedLockedAddress = localStorage.getItem('usdt_locked_withdraw_address') || '';
  const [address, setAddress] = useState(savedLockedAddress);
  const [isAddressLocked, setIsAddressLocked] = useState(Boolean(savedLockedAddress));
  const [showLockAlert, setShowLockAlert] = useState(false);

  const [amount, setAmount] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPendingSuccess, setIsPendingSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

  const NETWORK_FEE = 0.0; // 0 USDT fee
  const MIN_WITHDRAW = 0.1; // 0.1 USDT minimum

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      setIsPendingSuccess(false);
      setSubmittedData(null);
      setErrorMsg('');
      setShowLockAlert(false);
      setAmount('');

      // Refresh locked address from storage
      const locked = localStorage.getItem('usdt_locked_withdraw_address') || '';
      if (locked) {
        setAddress(locked);
        setIsAddressLocked(true);
      } else {
        setAddress('');
        setIsAddressLocked(false);
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleBackdropClick = (e) => {
    const dialog = dialogRef.current;
    if (dialog && e.target === dialog) {
      handleClose();
    }
  };

  const handleClose = () => {
    triggerHaptic('light');
    setShowLockAlert(false);
    onClose();
  };

  const handleMaxAmount = () => {
    triggerHaptic('light');
    setAmount(walletBalance.toString());
  };

  const handleLockedAddressClick = () => {
    if (isAddressLocked) {
      triggerHaptic('warning');
      setShowLockAlert(true);
      setTimeout(() => setShowLockAlert(false), 4000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg('');
    setShowLockAlert(false);

    const targetAddress = (isAddressLocked ? savedLockedAddress : address).trim();

    // 1. BEP20 Address validation (Must start with 0x and be 42 characters or valid BSC format)
    if (!targetAddress || !targetAddress.startsWith('0x') || targetAddress.length < 38) {
      triggerHaptic('error');
      setErrorMsg(
        'Please enter a valid BEP20 address! (Must start with 0x)'
      );
      return;
    }

    // 2. Multi-account duplicate prevention ("ar ak addres 2 ta jaigai use korte parbe na")
    try {
      const registeredAddrs = JSON.parse(localStorage.getItem('usdt_registered_addresses') || '[]');
      const lower = targetAddress.toLowerCase();
      const currentLockedLower = (savedLockedAddress || '').toLowerCase();

      // If address already registered by someone else or previously used elsewhere
      if (registeredAddrs.includes(lower) && lower !== currentLockedLower && !isAddressLocked) {
        triggerHaptic('error');
        setErrorMsg(
          'This address is already registered to another account! One address cannot be used in multiple accounts.'
        );
        return;
      }
    } catch (err) {
      console.error(err);
    }

    // 3. Amount validation
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < MIN_WITHDRAW) {
      triggerHaptic('error');
      setErrorMsg(`${t.minWithdrawNotice}`);
      return;
    }

    if (numAmount > walletBalance) {
      triggerHaptic('error');
      setErrorMsg(t.insufficientBalance);
      return;
    }

    const netAmount = Math.max(0, numAmount - NETWORK_FEE);
    const dateStr = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const withdrawPayload = {
      address: targetAddress,
      amount: numAmount,
      network: 'BEP20',
      netAmount,
      fee: NETWORK_FEE,
      date: dateStr,
      status: 'Pending'
    };

    try {
      setIsSubmitting(true);
      const res = await onWithdrawSubmit(withdrawPayload);
      if (res && res.success) {
        triggerHaptic('success');
        setSubmittedData({
          ...withdrawPayload,
          ...(res.transaction || {})
        });
        setIsPendingSuccess(true);
      } else {
        triggerHaptic('error');
        setErrorMsg(res?.message || 'Failed to process withdrawal. Please try again.');
      }
    } catch (err) {
      triggerHaptic('error');
      setErrorMsg(err.message || 'Network error submitting withdrawal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const numAmount = parseFloat(amount) || 0;
  const netAmount = Math.max(0, numAmount - NETWORK_FEE);

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={handleClose}
      aria-labelledby="withdraw-modal-title"
    >
      <div className="modal-inner">
        <div className="modal-drag-indicator" />

        <div className="modal-header-row">
          <div className="modal-title" id="withdraw-modal-title">
            <ArrowUpFromLine size={20} color="#2563eb" />
            {t.withdrawTitle}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {isPendingSuccess && submittedData ? (
          <div className="withdraw-success-pending-card">
            <div className="withdraw-pending-icon-circle">
              <Clock size={30} strokeWidth={2.4} />
            </div>

            <div className="withdraw-pending-badge">
              <Clock size={12} strokeWidth={2.5} />
              <span>Status: Pending</span>
            </div>

            <h4 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
              Withdrawal Request Submitted!
            </h4>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Your withdrawal request is now pending and added to your account history.
            </p>

            {/* Pending Details Box */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '18px',
              fontSize: '12.5px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Withdraw Amount</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{submittedData.amount.toFixed(2)} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Network Fee</span>
                <span style={{ fontWeight: 600, color: '#64748b' }}>{submittedData.fee.toFixed(2)} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>You Will Receive</span>
                <span style={{ fontWeight: 800, color: '#2563eb' }}>{submittedData.netAmount.toFixed(2)} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Network</span>
                <span style={{ fontWeight: 700, color: '#16a34a' }}>BEP20 (BNB Smart Chain)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>Address</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#334155', wordBreak: 'break-all', textAlign: 'right' }}>
                  {submittedData.address}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn-submit-action blue"
              onClick={handleClose}
            >
              <Check size={16} strokeWidth={2.4} />
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Top Box: USDT Coin Selection + BEP20 Network Selection */}
            <div className="withdraw-select-box">
              {/* Row 1: Coin Selection */}
              <div className="withdraw-select-row">
                <span className="withdraw-select-label">
                  Select Coin
                </span>
                <div className="withdraw-coin-pill">
                  <img src={usdtLogo} alt="USDT" className="withdraw-coin-icon" />
                  <span className="withdraw-coin-symbol">USDT</span>
                  <span className="withdraw-coin-name">Tether USD</span>
                </div>
              </div>

              <div className="withdraw-select-divider" />

              {/* Row 2: BEP20 Network Selection */}
              <div className="withdraw-select-row">
                <span className="withdraw-select-label">
                  Select Network
                </span>
                <div className="withdraw-network-pill">
                  <span className="network-dot" />
                  <span className="network-name">BEP20</span>
                  <span className="network-sub">(BNB Smart Chain)</span>
                </div>
              </div>
            </div>

            {/* Available Balance Preview */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Withdrawable Balance (Main)
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {formatUSDT(walletBalance)} USDT
              </span>
            </div>

            {/* Withdrawable Rule Notice */}
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '8px 12px',
              marginBottom: '14px',
              fontSize: '11.5px',
              color: '#166534',
              lineHeight: '1.45',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px'
            }}>
              <Lightbulb size={14} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                Only daily claimed mining rewards & bonuses can be withdrawn. Deposit balance is locked in mining.
              </span>
            </div>

            {/* Address Field with Permanent Lock and Duplicate Check */}
            <div className="form-group">
              <div className="form-label">
                <span>BEP20 Withdrawal Address</span>
                {isAddressLocked ? (
                  <span style={{ color: '#d97706', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Lock size={12} /> Locked
                  </span>
                ) : (
                  <span style={{ color: '#64748b' }}>Permanent</span>
                )}
              </div>

              <div 
                className={`form-input-wrap ${isAddressLocked ? 'locked' : ''}`}
                onClick={handleLockedAddressClick}
              >
                <input
                  type="text"
                  className="form-input"
                  placeholder="0x... (BEP20 USDT Address)"
                  value={address}
                  onChange={(e) => !isAddressLocked && setAddress(e.target.value)}
                  readOnly={isAddressLocked}
                  required
                />
                {isAddressLocked && (
                  <div className="lock-icon-indicator" title="Address is locked">
                    <Lock size={15} color="#b45309" />
                  </div>
                )}
              </div>

              {/* Security locked indicator or warning note */}
              {isAddressLocked ? (
                <div className="address-locked-badge">
                  <ShieldCheck size={13} color="#b45309" />
                  <span>
                    Address permanently locked for security. Cannot be modified.
                  </span>
                </div>
              ) : (
                <div className="address-first-notice">
                  ⚠️ Notice: Once set, this address is permanently locked and cannot be changed. Duplicate addresses across accounts are prohibited.
                </div>
              )}

              {/* Alert popup when attempting to change locked address */}
              {showLockAlert && (
                <div className="address-locked-alert-modal">
                  <Lock size={15} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ display: 'block', marginBottom: '2px' }}>
                      Address Lock Active!
                    </strong>
                    <span>
                      For account security, this withdrawal address is locked. It cannot be edited or changed.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Amount Field */}
            <div className="form-group">
              <div className="form-label">
                <span>{t.amount}</span>
                <span style={{ color: '#94a3b8' }}>{t.minWithdrawNotice}</span>
              </div>
              <div className="form-input-wrap">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-max-btn"
                  onClick={handleMaxAmount}
                >
                  {t.max}
                </button>
                <span className="form-input-currency">USDT</span>
              </div>
            </div>

            {/* Breakdown calculations */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginBottom: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>{t.networkFee}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{NETWORK_FEE.toFixed(2)} USDT</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a' }}>
                <span>{t.receiveAmount}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#2563eb' }}>
                  {netAmount.toFixed(2)} USDT
                </span>
              </div>
            </div>

            {errorMsg && (
              <div style={{
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '12px'
              }}>
                <AlertCircle size={14} />
                {errorMsg}
              </div>
            )}

            <button type="submit" className="btn-submit-action blue" disabled={isSubmitting}>
              <ArrowUpFromLine size={16} />
              {isSubmitting 
                ? 'Processing...' 
                : t.submitWithdraw}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
};
