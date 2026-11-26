// Weave landing page. No dependencies. Every thread is drawn from the live layout, so it follows
// the page at any width; the page reads completely without this script.
const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 60rem)');

const svgEl = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
};
const fmt = (n) => Math.round(n * 10) / 10;
const cubic = (a, b, c, d) => `M${fmt(a.x)},${fmt(a.y)} C${fmt(b.x)},${fmt(b.y)} ${fmt(c.x)},${fmt(c.y)} ${fmt(d.x)},${fmt(d.y)}`;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** Split a cubic at t = 0.5 so each half can sit on its own layer (over in one place, under in the next). */
function split(p0, p1, p2, p3) {
  const a = lerp(p0, p1, 0.5), b = lerp(p1, p2, 0.5), c = lerp(p2, p3, 0.5);
  const d = lerp(a, b, 0.5), e = lerp(b, c, 0.5), m = lerp(d, e, 0.5);
  return [[p0, a, d, m], [m, e, c, p3]];
}
/** Box of an element relative to a container, ignoring transforms on the element itself. */
function boxIn(node, container) {
  let x = 0, y = 0, n = node;
  while (n && n !== container) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}
const sizeSvg = (svg, w, h) => { svg.setAttribute('viewBox', `0 0 ${fmt(w)} ${fmt(h)}`); svg.setAttribute('width', fmt(w)); svg.setAttribute('height', fmt(h)); };

/* ---------- Hero: five app yarns weave one cloth that ends in the answer ---------- */
function drawdown() {
  const fig = document.querySelector('[data-drawdown]');
  if (!fig) return;
  const cloth = fig.querySelector('[data-cloth]');
  const warp = fig.querySelector('[data-warp]');
  const replay = fig.querySelector('[data-replay]');
  const apps = [...fig.querySelectorAll('.app')];
  const yarns = apps.map((a) => a.dataset.yarn);
  const COLS = 30, ROWS = 12, PER = COLS / yarns.length;
  // A point threading and treadling on a 2/2 twill tie-up: the small diamond weavers call bird's eye.
  const POINT = [0, 1, 2, 3, 2, 1];
  const isUp = (c, r) => (POINT[c % 6] + POINT[r % 6]) % 4 < 2;

  for (let r = 0; r < ROWS; r++) {
    const pick = svgEl('g', { class: 'pick', style: `--r:${r}` }, cloth);
    for (let c = 0; c < COLS; c++) {
      const yarn = yarns[Math.floor(c / PER)];
      const attrs = { x: c * 10 + 0.5, y: r * 10 + 0.5, width: 9, height: 9, rx: 1.2 };
      if (isUp(c, r)) Object.assign(attrs, { class: `up y-${yarn}`, 'data-yarn': yarn });
      else attrs.class = 'dn';
      svgEl('rect', attrs, pick);
    }
  }

  // Each app's yarn fans out from its button into its six warp columns.
  function threadWarp() {
    warp.replaceChildren();
    const wr = warp.getBoundingClientRect(), cr = cloth.getBoundingClientRect();
    if (!wr.width) return;
    sizeSvg(warp, wr.width, wr.height);
    const colW = cr.width / COLS;
    apps.forEach((app, i) => {
      const ar = app.getBoundingClientRect();
      for (let k = 0; k < PER; k++) {
        const S = { x: ar.left - wr.left + ar.width * (0.3 + (0.4 * k) / (PER - 1)), y: -2 };
        const E = { x: cr.left - wr.left + (i * PER + k + 0.5) * colW, y: wr.height + 2 };
        svgEl('path', { d: cubic(S, { x: S.x, y: wr.height * 0.55 }, { x: E.x, y: wr.height * 0.45 }, E), pathLength: 1, class: `y-${yarns[i]}`, 'data-yarn': yarns[i], style: `--i:${i * PER + k}` }, warp);
      }
    });
  }

  // Choosing an app follows its yarn through the cloth and into the answer's sources.
  const setFocus = (yarn) => { if (yarn) fig.dataset.focus = yarn; else delete fig.dataset.focus; };
  const pressed = () => apps.find((a) => a.getAttribute('aria-pressed') === 'true');
  apps.forEach((app) => {
    const yarn = app.dataset.yarn;
    app.addEventListener('pointerenter', () => setFocus(yarn));
    app.addEventListener('pointerleave', () => setFocus(pressed()?.dataset.yarn));
    app.addEventListener('focus', () => setFocus(yarn));
    app.addEventListener('blur', () => setFocus(pressed()?.dataset.yarn));
    app.addEventListener('click', () => {
      const on = app.getAttribute('aria-pressed') !== 'true';
      apps.forEach((a) => a.setAttribute('aria-pressed', String(a === app && on)));
      setFocus(on ? yarn : null);
    });
  });

  const weave = () => { fig.classList.remove('is-weaving'); void fig.offsetWidth; fig.classList.add('is-weaving'); };
  const syncReplay = () => { replay.hidden = reduceMotion.matches; };
  replay.addEventListener('click', weave);
  reduceMotion.addEventListener('change', syncReplay);
  syncReplay();

  threadWarp();
  if (!reduceMotion.matches) fig.classList.add('is-weaving');
  new ResizeObserver(threadWarp).observe(fig);
  document.fonts?.ready.then(threadWarp);
}

/* ---------- The fragmentation: one tangled trip through five apps ---------- */
function tangle() {
  const stage = document.querySelector('[data-tangle]');
  if (!stage) return;
  const svg = stage.querySelector('[data-tangle-svg]');
  const trip = [...document.querySelectorAll('.hops [data-hop]')].map((li) => li.dataset.hop);
  const chips = Object.fromEntries([...stage.querySelectorAll('.chip')].map((c) => [c.dataset.app, c]));
  const path = svgEl('path', { class: 'tg-path', pathLength: 1 }, svg);
  const knots = trip.map((_, i) => {
    const k = document.createElement('span');
    k.className = 'knot';
    k.setAttribute('aria-hidden', 'true');
    k.style.setProperty('--i', i);
    k.textContent = String(i + 1);
    stage.append(k);
    return k;
  });
  const rot = (v, deg) => { const r = (deg * Math.PI) / 180; return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) }; };

  function draw() {
    const W = stage.clientWidth, H = stage.clientHeight;
    sizeSvg(svg, W, H);
    const seen = {};
    const pts = trip.map((id, i) => {
      const b = boxIn(chips[id], stage);
      const visit = (seen[id] = (seen[id] ?? -1) + 1);
      knots[i].style.left = `${fmt(b.x + b.w - 10 + visit * 30)}px`;
      knots[i].style.top = `${fmt(b.y - 14)}px`;
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    });
    let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const sign = i % 2 ? 1 : -1;
      const v = { x: q.x - p.x, y: q.y - p.y };
      const a = rot(v, 58 * sign), b = rot({ x: -v.x, y: -v.y }, -48 * sign);
      d += ` C${fmt(p.x + a.x * 0.5)},${fmt(p.y + a.y * 0.5)} ${fmt(q.x + b.x * 0.45)},${fmt(q.y + b.y * 0.45)} ${fmt(q.x)},${fmt(q.y)}`;
    }
    path.setAttribute('d', d);
  }
  draw();
  new ResizeObserver(draw).observe(stage);
  document.fonts?.ready.then(draw);
}

/* ---------- One question: every point keeps a thread to its record ---------- */
function loom() {
  const loomEl = document.querySelector('[data-loom]');
  if (!loomEl) return;
  const svg = loomEl.querySelector('[data-loom-svg]');
  const reply = loomEl.querySelector('.reply');
  const sources = Object.fromEntries([...loomEl.querySelectorAll('.source')].map((s) => [s.dataset.src, s]));
  const under = svgEl('g', {}, svg);
  const over = svgEl('g', {}, svg);

  function draw() {
    under.replaceChildren(); over.replaceChildren();
    if (narrow.matches) return;
    const base = loomEl.getBoundingClientRect();
    sizeSvg(svg, base.width, base.height);
    const rel = (r) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    const rb = rel(reply.getBoundingClientRect());
    let n = 0;
    reply.querySelectorAll('.reply-points li').forEach((li) => {
      const lb = rel(li.getBoundingClientRect());
      const cites = [...li.querySelectorAll('.cite')];
      cites.forEach((cite, j) => {
        const src = cite.dataset.cite;
        const sb = rel(sources[src].getBoundingClientRect());
        const S = { x: sb.x + sb.w - 10, y: sb.y + sb.h / 2 };
        const E = { x: rb.x + 12, y: lb.y + lb.h / 2 + (j - (cites.length - 1) / 2) * 10 };
        const dx = E.x - S.x;
        const halves = split(S, { x: S.x + dx * 0.5, y: S.y }, { x: E.x - dx * 0.5, y: E.y }, E);
        const thread = sources[src].dataset.thread;
        halves.forEach((h, half) => {
          const layer = (Number(src) + half) % 2 ? over : under;
          const style = `--i:${n}`;
          svgEl('path', { class: 'lm-gap', d: cubic(...h), pathLength: 1, 'data-src': src, style }, layer);
          svgEl('path', { class: `lm-line lm-${thread}`, d: cubic(...h), pathLength: 1, 'data-src': src, style }, layer);
        });
        n++;
      });
    });
  }

  const light = (src) => {
    if (src) loomEl.dataset.active = src; else delete loomEl.dataset.active;
    loomEl.querySelectorAll('.is-lit').forEach((x) => x.classList.remove('is-lit'));
    if (!src) return;
    sources[src]?.classList.add('is-lit');
    loomEl.querySelectorAll(`.cite[data-cite="${src}"]`).forEach((c) => c.classList.add('is-lit'));
  };
  loomEl.querySelectorAll('.cite, .source').forEach((node) => {
    const src = node.dataset.cite ?? node.dataset.src;
    node.addEventListener('pointerenter', () => light(src));
    node.addEventListener('pointerleave', () => light(null));
    node.addEventListener('focus', () => light(src));
    node.addEventListener('blur', () => light(null));
  });

  draw();
  new ResizeObserver(draw).observe(loomEl);
  narrow.addEventListener('change', draw);
  document.fonts?.ready.then(draw);
}

/* ---------- Trust: leader threads from each promise to the part of the draft it describes ---------- */
function trust() {
  const grid = document.querySelector('[data-trust]');
  if (!grid) return;
  const svg = svgEl('svg', { class: 'trust-leaders', 'aria-hidden': 'true' });
  grid.prepend(svg);
  const draft = grid.querySelector('.draft');
  function draw() {
    svg.replaceChildren();
    if (narrow.matches) return;
    const base = grid.getBoundingClientRect();
    sizeSvg(svg, base.width, base.height);
    const dr = draft.getBoundingClientRect();
    grid.querySelectorAll('.promise').forEach((p) => {
      const mark = draft.querySelector(`[data-mark="${p.dataset.for}"]`);
      const num = p.querySelector('.promise-n');
      if (!mark || !num) return;
      const mr = mark.getBoundingClientRect(), nr = num.getBoundingClientRect();
      const S = { x: dr.right - base.left, y: mr.top + mr.height / 2 - base.top };
      const E = { x: nr.left + nr.width / 2 - base.left, y: nr.top + nr.height / 2 - base.top };
      const dx = E.x - S.x;
      svgEl('path', { d: cubic(S, { x: S.x + dx * 0.5, y: S.y }, { x: E.x - dx * 0.5, y: E.y }, E) }, svg);
    });
  }
  draw();
  new ResizeObserver(draw).observe(grid);
  narrow.addEventListener('change', draw);
  document.fonts?.ready.then(draw);
}

/* ---------- Reveal: each woven figure draws once as it comes into view ---------- */
function reveal() {
  const targets = document.querySelectorAll('[data-tangle], [data-loom], [data-steps], [data-strands], [data-flow], [data-closing]');
  if (reduceMotion.matches || !('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.3 });
  targets.forEach((t) => io.observe(t));
}

/* ---------- Nav: small-screen menu and the current section ---------- */
function nav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;
  const set = (open) => { toggle.setAttribute('aria-expanded', String(open)); links.toggleAttribute('data-open', open); };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && links.hasAttribute('data-open')) { set(false); toggle.focus(); } });
  narrow.addEventListener('change', () => set(false));

  const anchors = [...links.querySelectorAll('a')];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      anchors.forEach((a) => a.toggleAttribute('aria-current', a.hash === `#${e.target.id}`));
      anchors.forEach((a) => { if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'true'); });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main > section[id]').forEach((s) => io.observe(s));
}

drawdown();
tangle();
loom();
trust();
reveal();
nav();
