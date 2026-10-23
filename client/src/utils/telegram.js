// Telegram WebApp SDK helper
export const getTelegramWebApp = () => {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

export const initTelegramApp = () => {
  const tg = getTelegramWebApp();
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      // Set header color to white to match clean theme
      if (tg.setHeaderColor) {
        tg.setHeaderColor('#ffffff');
      }
      if (tg.setBackgroundColor) {
        tg.setBackgroundColor('#f8fafc');
      }
    } catch (err) {
      console.warn('Telegram WebApp init warning:', err);
    }
  }
};

export const triggerHaptic = (type = 'light') => {
  const tg = getTelegramWebApp();
  if (tg && tg.HapticFeedback) {
    try {
      if (type === 'success' || type === 'error' || type === 'warning') {
        tg.HapticFeedback.notificationOccurred(type);
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    } catch {
      // Haptics not supported in desktop web
    }
  }
};

// Retrieve Start Parameter (Referral code)
export const getTelegramStartParam = () => {
  const tg = getTelegramWebApp();
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
    return tg.initDataUnsafe.start_param.toString();
  }
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    return params.get('startapp') || params.get('tgWebAppStartParam') || params.get('start') || params.get('ref') || '';
  }
  return '';
};

// Retrieve Real Telegram User Profile
export const getTelegramUser = () => {
  const tg = getTelegramWebApp();
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const u = tg.initDataUnsafe.user;
    try {
      localStorage.setItem('usdt_tg_user', JSON.stringify(u));
    } catch {}
    return u;
  }

  // Check URL params if passed e.g. ?user_id=...&first_name=...
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('tg_id') || params.get('user_id') || params.get('id');
    const first_name = params.get('first_name');
    const username = params.get('username');
    if (id || first_name || username) {
      const parsed = {
        id: id || '987654321',
        first_name: first_name || 'Mining User',
        last_name: params.get('last_name') || '',
        username: username || 'miner',
        photo_url: params.get('photo_url') || null,
        language_code: params.get('lang') || 'bn'
      };
      try {
        localStorage.setItem('usdt_tg_user', JSON.stringify(parsed));
      } catch {}
      return parsed;
    }
  }

  // Check stored in localStorage from previous session
  try {
    const stored = localStorage.getItem('usdt_tg_user');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}

  return {
    id: 987654321,
    first_name: 'Mining User',
    last_name: '',
    username: 'cryptominer_bd',
    language_code: 'bn'
  };
};
