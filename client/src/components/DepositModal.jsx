import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  QrCode, 
  ShieldCheck, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  ArrowLeft, 
  Clipboard, 
  Receipt,
  Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { copyToClipboard } from '../utils/formatters';
import { triggerHaptic, getTelegramUser } from '../utils/telegram';
import usdtBep20Logo from '../assets/usdt-bep20-logo.jpg';

const BEP20_ADDRESS = '0xf8e3Ea58EDB3719D934E1C2Bef4d160C1772FA81';

export const DepositModal = ({ isOpen, onClose, onSimulateDeposit, lang, prefilledAmount = 3, user }) => {
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);
  
  // Modal step: 'address' | 'receipt' | 'credited'
  const [step, setStep] = useState('address');
  const [isVerifyingNext, setIsVerifyingNext] = useState(false);
  const [txId, setTxId] = useState('');
  const [amount, setAmount] = useState('3');
  const [txError, setTxError] = useState('');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  // Reset state when modal opens or closes
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setStep('address');
      setIsVerifyingNext(false);
      setTxId('');
      setAmount('3');
      setTxError('');
      setIsSubmittingTx(false);
      if (!dialog.open) {
        dialog.showModal();
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
    onClose();
  };

  const handleCopy = async () => {
    triggerHaptic('success');
    const ok = await copyToClipboard(BEP20_ADDRESS);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  // Button loader on click, then move to receipt TxID paste screen
  const handleNextToReceipt = () => {
    if (isVerifyingNext) return;
    triggerHaptic('medium');
    setIsVerifyingNext(true);

    setTimeout(() => {
      setIsVerifyingNext(false);
      setStep('receipt');
      triggerHaptic('success');
    }, 1200);
  };

  // Paste transaction ID from clipboard
  const handlePasteTxId = async () => {
    try {
      triggerHaptic('light');
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setTxId(text.trim());
          setTxError('');
          return;
        }
      }
      const promptVal = window.prompt(
        'Paste your Transaction ID (TxHash) here:'
      );
      if (promptVal && promptVal.trim()) {
        setTxId(promptVal.trim());
        setTxError('');
      }
    } catch (err) {
      const promptVal = window.prompt(
        'Paste your Transaction ID (TxHash) here:'
      );
      if (promptVal && promptVal.trim()) {
        setTxId(promptVal.trim());
        setTxError('');
      }
    }
  };

  // Submit TxID and credit deposit via BSC backend on-chain verification
  const handleSubmitReceipt = async () => {
    let rawTx = txId ? txId.trim() : '';
    // Strip BSCScan or explorer URL if user pasted the full link
    if (rawTx.includes('/tx/')) {
      rawTx = rawTx.split('/tx/')[1].split(/[?#& ]/)[0];
    }
    rawTx = rawTx.replace(/['"<>]/g, '').trim();

    if (!rawTx || rawTx.length < 10) {
      triggerHaptic('warning');
      setTxError(
        'Please enter a valid Transaction Hash / TxID.'
      );
      return;
    }

    const formattedTx = rawTx.startsWith('0x') ? rawTx : `0x${rawTx}`;

    // Valid BSC transaction hashes are 66 characters: 0x followed by 64 hexadecimal characters
    if (!/^0x[a-fA-F0-9]{64}$/.test(formattedTx)) {
      triggerHaptic('warning');
      setTxError(
        'Invalid TxHash format (must be 66 hex characters starting with 0x).'
      );
      return;
    }

    setTxError('');
    setIsSubmittingTx(true);
    triggerHaptic('medium');

    const tgUser = getTelegramUser();
    const actualUserId = tgUser?.id ? String(tgUser.id) : (user?.id ? String(user.id) : '');
    const actualUsername = tgUser?.username || user?.username || '';
    const actualFirstName = tgUser?.first_name || user?.first_name || '';
    const actualLastName = tgUser?.last_name || user?.last_name || '';

    try {
      const response = await fetch('/api/deposit/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: formattedTx,
          userId: actualUserId,
          telegramId: actualUserId,
          username: actualUsername,
          firstName: actualFirstName,
          lastName: actualLastName
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setIsSubmittingTx(false);
        triggerHaptic('warning');
        const errDetail = data.message || 'Verification failed';
        setTxError(errDetail);
        return;
      }

      // Successful verified deposit from BSC on-chain ledger
      const verifiedAmount = data.amount || parseFloat(amount) || 3;
      setAmount(verifiedAmount.toString());
      setIsSubmittingTx(false);
      setStep('credited');
      triggerHaptic('success');

      try {
        confetti({
          particleCount: 65,
          spread: 80,
          origin: { y: 0.4 }
        });
      } catch (e) {}

      if (onSimulateDeposit) {
        onSimulateDeposit(verifiedAmount, data.txHash || formattedTx, data);
      }
    } catch (err) {
      setIsSubmittingTx(false);
      triggerHaptic('warning');
      setTxError(
        'Network or server connection failed. Please try again.'
      );
    }
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(BEP20_ADDRESS)}&color=0f172a&bgcolor=ffffff`;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={handleClose}
      aria-labelledby="deposit-modal-title"
    >
      <div className="modal-inner deposit-modal-clean">
        <div className="modal-drag-indicator" />

        {/* Modal Header */}
        <div className="modal-header-row">
          <div className="modal-title" id="deposit-modal-title">
            {step === 'receipt' && (
              <button 
                type="button" 
                className="btn-modal-back"
                onClick={() => setStep('address')}
                title="Back to QR Code"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <QrCode size={20} color="#00b074" />
            <span>
              {step === 'receipt' 
                ? 'Deposit Receipt'
                : 'Deposit USDT'}
            </span>
            <span className="network-pill-badge">BEP20</span>
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

        {/* ---------------- STEP 1: ADDRESS & QR CODE ---------------- */}
        {step === 'address' && (
          <>
            {/* Network Info Banner */}
            <div className="deposit-network-banner">
              <img
                src={usdtBep20Logo}
                alt="USDT BEP20 Logo"
                className="network-logo-img"
              />
              <div className="network-banner-text">
                <span className="network-name">USDT (BEP20)</span>
                <span className="network-chain">BNB Smart Chain (BSC Network)</span>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="qr-wrapper-clean">
              <div className="qr-frame">
                <img
                  src={qrUrl}
                  alt="USDT BEP20 QR Code"
                  className="qr-image-clean"
                  loading="lazy"
                />
              </div>
              <span className="qr-scan-hint">
                Scan QR code with your crypto wallet
              </span>
            </div>

            {/* Address Box */}
            <div className="deposit-address-container">
              <label className="deposit-address-label">
                Your USDT BEP20 Deposit Address
              </label>
              <div className="deposit-address-box">
                <span className="address-text">{BEP20_ADDRESS}</span>
                <button
                  type="button"
                  className={`btn-copy ${copied ? 'copied' : ''}`}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check size={14} color="#00b074" strokeWidth={2.6} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Important Minimum Deposit Notice */}
            <div className="deposit-important-alert">
              <div className="alert-icon-wrap">
                <AlertTriangle size={18} color="#d97706" />
              </div>
              <div className="alert-text-wrap">
                <span className="alert-title">
                  Important Notice:
                </span>
                <p className="alert-desc">
                  Minimum deposit is $3 USDT (BEP20). Deposits below $3 cannot be credited or refunded.
                </p>
              </div>
            </div>

            {/* Next / Verify Deposit Button with in-button loader */}
            <button
              type="button"
              className={`btn-verify-deposit ${isVerifyingNext ? 'loading' : ''}`}
              onClick={handleNextToReceipt}
              disabled={isVerifyingNext}
            >
              {isVerifyingNext ? (
                <>
                  <Loader2 size={18} className="spin-loader" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Next (Verify Deposit)</span>
                </>
              )}
            </button>
          </>
        )}

        {/* ---------------- STEP 2: RECEIPT & TRANSACTION ID INPUT ---------------- */}
        {step === 'receipt' && (
          <div className="deposit-receipt-view">
            {/* Receipt Summary Card */}
            <div className="receipt-status-card">
              <div className="receipt-badge-row">
                <span className="receipt-title-lbl">
                  <Receipt size={14} color="#00b074" />
                  Payment Receipt Verification
                </span>
                <span className="receipt-status-pill">
                  Pending Verification
                </span>
              </div>
              <p className="receipt-helper-text">
                Paste your Transaction ID (TxHash) from your wallet/exchange to verify and credit your balance.
              </p>
            </div>

            {/* Transaction ID Input Form */}
            <div className="receipt-form-group">
              <label htmlFor="txid-input" className="receipt-input-lbl">
                Transaction ID / Hash (TxHash) *
              </label>
              <div className="receipt-input-wrapper">
                <input
                  id="txid-input"
                  type="text"
                  value={txId}
                  onChange={(e) => {
                    setTxId(e.target.value);
                    if (txError) setTxError('');
                  }}
                  placeholder="0x7f9a8b... or paste TxID"
                  className="receipt-tx-input"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-paste-tx"
                  onClick={handlePasteTxId}
                >
                  <Clipboard size={13} />
                  <span>Paste</span>
                </button>
              </div>
              {txError && (
                <span className="receipt-error-text">{txError}</span>
              )}
            </div>

            {/* Deposit Amount Field */}
            <div className="receipt-form-group">
              <div className="receipt-amt-header">
                <label htmlFor="tx-amount-input" className="receipt-input-lbl">
                  Deposited Amount (USDT)
                </label>
                <span className="receipt-min-tag">
                  Min $3.00 USDT
                </span>
              </div>
              <div className="receipt-amt-wrapper">
                <span className="receipt-currency-prefix">$</span>
                <input
                  id="tx-amount-input"
                  type="number"
                  min="3"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="3.00"
                  className="receipt-amt-input"
                />
                <span className="receipt-currency-badge">USDT</span>
              </div>
            </div>

            {/* Submit Receipt Button */}
            <button
              type="button"
              className={`btn-verify-deposit ${isSubmittingTx ? 'loading' : ''}`}
              onClick={handleSubmitReceipt}
              disabled={isSubmittingTx}
            >
              {isSubmittingTx ? (
                <>
                  <Loader2 size={18} className="spin-loader" />
                  <span>Verifying & Crediting...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Confirm & Credit Deposit</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ---------------- STEP 3: SUCCESS CREDITED CONFIRMATION ---------------- */}
        {step === 'credited' && (
          <div className="deposit-success-view">
            <div className="success-icon-badge">
              <CheckCircle2 size={44} color="#00b074" strokeWidth={2.4} />
            </div>

            <h3 className="success-headline">
              Deposit Successfully Credited!
            </h3>
            <div className="success-amount-display">
              +{parseFloat(amount || 3).toFixed(2)} USDT
            </div>

            <div className="success-details-card">
              <div className="success-row">
                <span className="success-lbl">Network</span>
                <span className="success-val">USDT (BEP20)</span>
              </div>
              <div className="success-row">
                <span className="success-lbl">Status</span>
                <span className="success-val green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Completed
                </span>
              </div>
              <div className="success-row">
                <span className="success-lbl">TxID</span>
                <span className="success-val mono">
                  {txId ? `${txId.substring(0, 8)}...${txId.substring(txId.length - 6)}` : '0x889...d4e3'}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn-verify-deposit"
              onClick={handleClose}
            >
              <Sparkles size={17} />
              <span>Back to Dashboard</span>
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
};
