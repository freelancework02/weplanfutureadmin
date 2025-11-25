(function () {
  const KEY = 'wpfa_auth_user';
  const rootAttr = document.documentElement.getAttribute('data-root') || './';
  const normalizeRoot = (val) => {
    if (!val) return './';
    return val.endsWith('/') ? val : `${val}/`;
  };
  const ROOT = normalizeRoot(rootAttr);
  const resolve = (path) => {
    if (!path) return ROOT;
    return `${ROOT}${path.replace(/^\/+/, '')}`;
  };
  const LOGIN_PAGE = resolve('login.html');
  const DASHBOARD_PAGE = resolve('index.html');

  const storage = {
    get() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('Auth storage read failed', err);
        return null;
      }
    },
    set(user) {
      try {
        localStorage.setItem(KEY, JSON.stringify(user || {}));
      } catch (err) {
        console.warn('Auth storage write failed', err);
      }
    },
    clear() {
      try {
        localStorage.removeItem(KEY);
      } catch (err) {
        console.warn('Auth storage clear failed', err);
      }
    },
  };

  function buildRedirectParam() {
    const current = window.location.pathname + window.location.search;
    return encodeURIComponent(current);
  }

  function requireAuth() {
    if (!storage.get()) {
      window.location.href = `${LOGIN_PAGE}?redirect=${buildRedirectParam()}`;
    }
  }

  function redirectIfAuthenticated() {
    const user = storage.get();
    if (user) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      if (redirect) {
        window.location.href = redirect;
      } else {
        window.location.href = DASHBOARD_PAGE;
      }
    }
  }

  function logout(toLogin = true) {
    storage.clear();
    if (toLogin) window.location.href = LOGIN_PAGE;
  }

  window.Auth = {
    getUser: storage.get,
    setUser: storage.set,
    clearUser: storage.clear,
    requireAuth,
    redirectIfAuthenticated,
    logout,
    loginPath: LOGIN_PAGE,
    dashboardPath: DASHBOARD_PAGE,
  };
})();

