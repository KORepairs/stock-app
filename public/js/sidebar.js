// server/public/js/sidebar.js
(async () => {
  const host = document.getElementById('sidebar');
  if (!host) return;

  try {
    // load the shared sidebar HTML
    const res = await fetch('/partials/sidebar.html');
    const html = await res.text();
    host.innerHTML = html;

    // ✅ Load last export times
try {
  const r = await fetch('/api/exports/last');
  const data = await r.json();

  function fmt(ts) {
    if (!ts) return "Never exported";
    const d = new Date(ts);
    return "Last exported: " + d.toLocaleString();
  }

  const prod = document.getElementById('lastExportProducts');
  const refurb = document.getElementById('lastExportRefurb');

  if (prod) prod.textContent = fmt(data.products);
  if (refurb) refurb.textContent = fmt(data.refurb);

} catch (e) {
  console.warn("Could not load export timestamps");
}


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

