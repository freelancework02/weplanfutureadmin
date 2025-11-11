/* assets/js/app.js */
(function () {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];

  // Sidebar toggle (mobile)
  qsa('[data-toggle="sidebar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('sidebar-open');
    });
  });

  // Dismissible alerts
  qsa('[data-dismiss="alert"]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('[role="alert"]')?.remove());
  });

  // Simple search filter for tables (matches any row text)
  qsa('[data-table-filter]').forEach(input => {
    const target = input.getAttribute('data-table-filter');
    const table = qs(target);
    if (!table) return;

    input.addEventListener('input', () => {
      const term = input.value.trim().toLowerCase();
      qsa('tbody tr', table).forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(term) ? '' : 'none';
      });
    });
  });

  // Action buttons (demo)
  qsa('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      alert(`${action.toUpperCase()} item #${id}`);
    });
  });

  // Persisted theme toggle (light/dark)
  const themeBtn = qs('[data-toggle="theme"]');
  const setTheme = (t) => {
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', t);
  };
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      setTheme(next);
    });
  }
  // Initialize from storage or prefers-color-scheme
  const stored = localStorage.getItem('theme');
  if (stored) setTheme(stored);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
})();
