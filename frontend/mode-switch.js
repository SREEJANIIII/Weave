// The developer mode switch is a plain link. With scripting, the thumb slides before the page changes.
const link = document.querySelector('[data-mode-switch]');
if (link) {
  const initial = link.classList.contains('is-on');
  // Coming back with the Back button restores this page from cache; put the thumb back where it belongs.
  addEventListener('pageshow', () => link.classList.toggle('is-on', initial));
  link.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    sessionStorage.setItem('weave-vt', 'mode');
    link.classList.toggle('is-on');
    setTimeout(() => { location.href = link.href; }, 200);
  });
}

// Tag the outgoing side of a switch navigation so both pages run the woven curtain.
addEventListener('pageswap', (e) => {
  if (e.viewTransition && sessionStorage.getItem('weave-vt') === 'mode') e.viewTransition.types.add('mode');
});
