(() => {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); });
  nav?.addEventListener('click', (event) => { if (event.target.closest('a')) { menu?.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); } });
  const privacy = document.querySelector('.privacy-toggle');
  const popover = document.querySelector('#privacy-popover');
  privacy?.addEventListener('click', () => { const open = privacy.getAttribute('aria-expanded') !== 'true'; privacy.setAttribute('aria-expanded', String(open)); popover.hidden = !open; });

  const tabs = [...document.querySelectorAll('[role="tab"][data-demo]')];
  if (!tabs.length) return;
  const panels = [...document.querySelectorAll('[role="tabpanel"][data-panel]')];
  const demo = document.querySelector('.demo-shell');
  const counter = document.querySelector('.demo-bottom span:last-child');
  let index = 0; let userSelected = false; let inView = false;
  const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function select(next, focus = false) {
    index = (next + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; if (focus && i === index) tab.focus(); });
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
    if (counter) counter.textContent = `0${index + 1} / 0${tabs.length}`;
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { userSelected = true; select(i); });
    tab.addEventListener('keydown', (event) => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (delta) { event.preventDefault(); userSelected = true; select(i + delta, true); } });
  });
  if (motionAllowed && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => { inView = entries[0]?.isIntersecting || false; }, { threshold: .5 });
    observer.observe(demo);
    setInterval(() => { if (inView && !userSelected && !document.hidden) select(index + 1); }, 7000);
  }
})();
