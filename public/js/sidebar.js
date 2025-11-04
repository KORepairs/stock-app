// server/public/js/sidebar.js
(async () => {
  const host = document.getElementById('sidebar');
  if (!host) return;

  try {
    // load the shared sidebar HTML
    const res = await fetch('/partials/sidebar.html');
    const html = await res.text();
    host.innerHTML = html;

    // highlight the current page link
    const path = (location.pathname.replace(/\/$/, '') || '/');
    host.querySelectorAll('a').forEach(a => {
      const href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/';
      if (href === path) a.classList.add('active');
    });
  } catch (err) {
    console.error('Sidebar load failed:', err);
  }
})();

