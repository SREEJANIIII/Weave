// Everyday page. The hero's untangling is pure CSS (scroll-driven); this file runs the parts you touch:
// cards that lean from your pointer, the sky that follows the day, the question demo, the calendar
// you can press, and the woven field at the end. Every part rests in a finished state without it.
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onScreen = (el, fn, options = { threshold: 0.25 }) => {
  if (!('IntersectionObserver' in window)) return fn(true);
  new IntersectionObserver((es) => es.forEach((e) => fn(e.isIntersecting)), options).observe(el);
};

/* ---------- Hero: the app cards lean away from your pointer ---------- */
function heroPointer() {
  const stage = document.querySelector('[data-uv]');
  if (!stage) return;
  const cards = [...stage.querySelectorAll('.uv-in')];
  const depth = [1.2, 0.8, 1.4, 1, 0.9, 1.3];
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const tick = () => {
    x += (tx - x) * 0.1;
    y += (ty - y) * 0.1;
    cards.forEach((c, i) => {
      c.style.setProperty('--px', `${(x * depth[i]).toFixed(1)}px`);
      c.style.setProperty('--py', `${(y * depth[i]).toFixed(1)}px`);
    });
    raf = Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05 ? requestAnimationFrame(tick) : 0;
  };
  const hero = stage.closest('.hero');
  hero.addEventListener('pointermove', (e) => {
    if (reduce.matches || !finePointer.matches) return;
    const r = stage.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * -18;
    ty = ((e.clientY - r.top) / r.height - 0.5) * -12;
    if (!raf) raf = requestAnimationFrame(tick);
  });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
}

/* ---------- A day: one time value drives the day instrument, the slider and the timeline ---------- */
function day() {
  const sky = document.querySelector('[data-sky]');
  const items = [...document.querySelectorAll('.timeline li')];
  const scrub = document.querySelector('[data-scrub]');
  if (!sky || !items.length) return;
  const NS = 'http://www.w3.org/2000/svg';
  const sun = sky.querySelector('[data-sun]');
  const threadsEl = sky.querySelector('[data-threads]');
  const labelsEl = sky.querySelector('[data-labels]');
  const clock = sky.querySelector('[data-clock]');
  const momentLabel = sky.querySelector('[data-moment-label]');
  // The four moments at their real hours; the arc runs from 6:00 (left horizon) to 20:00 (right horizon).
  const HOURS = [9.75, 13, 16.5, 21];
  const TIME = ['9:45', '13:00', '16:30', '21:00'];
  const MOMENT = items.map((li) => li.querySelector('.moment')?.textContent.trim() ?? '');
  const APPS = items.map((li) => [...li.querySelectorAll('.apps-used span')].map((s) => ({ yarn: s.dataset.yarn, name: s.textContent.trim() })));
  const SPOTS = { 2: [140, 260], 3: [112, 200, 288] };
  const TOPS = [238, 222, 246];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let shown = -1, t = 0, tween = 0;
  sky.classList.add('is-live');

  function arcPoint(hour) {
    const frac = (hour - 6) / 14;
    const th = Math.PI * (1 - frac);
    return { x: 200 + 160 * Math.cos(th), y: 290 - 160 * Math.sin(th), frac };
  }
  function threads(i) {
    if (i === shown) return;
    shown = i;
    const instant = reduce.matches;
    const out = [...threadsEl.children, ...labelsEl.children].filter((n) => !n.classList.contains('is-out'));
    out.forEach((n) => { if (instant) return n.remove(); n.classList.remove('is-in'); n.classList.add('is-out'); setTimeout(() => n.remove(), 340); });
    const apps = APPS[i];
    const xs = SPOTS[apps.length] ?? SPOTS[3];
    apps.forEach((app, k) => {
      const x = xs[k], top = TOPS[k], d = `${(k * 0.12).toFixed(2)}s`;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `thread${instant ? '' : ' is-in'}`);
      g.dataset.yarn = app.yarn;
      g.style.setProperty('--d', d);
      const line = document.createElementNS(NS, 'line');
      Object.entries({ x1: x, y1: 290, x2: x, y2: top }).forEach(([a, v]) => line.setAttribute(a, v));
      const dot = document.createElementNS(NS, 'circle');
      Object.entries({ cx: x, cy: top, r: 3 }).forEach(([a, v]) => dot.setAttribute(a, v));
      g.append(line, dot);
      threadsEl.append(g);
      const tag = document.createElement('span');
      tag.className = `sky-label${instant ? '' : ' is-in'}`;
      tag.textContent = app.name;
      tag.style.setProperty('--lx', `${(x / 4).toFixed(2)}%`);
      tag.style.setProperty('--ly', `${(top / 4).toFixed(2)}%`);
      tag.style.setProperty('--d', d);
      labelsEl.append(tag);
    });
  }
  function rollClock(i) {
    momentLabel.textContent = MOMENT[i];
    const current = clock.querySelector('.sky-time:not(.is-out)');
    if (current && current.textContent === TIME[i]) return;
    const next = document.createElement('span');
    next.className = `sky-time${reduce.matches ? '' : ' is-in'}`;
    next.textContent = TIME[i];
    if (current) {
      if (reduce.matches) current.remove();
      else { current.classList.add('is-out'); setTimeout(() => current.remove(), 340); }
    }
    clock.append(next);
  }
  function render(value) {
    t = clamp(value, 0, 3);
    const k = Math.min(2, Math.floor(t));
    const hour = HOURS[k] + (HOURS[k + 1] - HOURS[k]) * (t - k);
    const p = arcPoint(hour);
    sun.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    sky.style.setProperty('--done', clamp(p.frac, 0, 1).toFixed(3));
    for (let j = 0; j < 4; j++) sky.style.setProperty(`--o${j}`, Math.max(0, 1 - Math.abs(t - j)).toFixed(3));
    sky.style.setProperty('--night', clamp((t - 2.2) / 0.8, 0, 1).toFixed(3));
    sky.style.setProperty('--sun', (1 - clamp((hour - 19.4) / 0.9, 0, 1)).toFixed(3));
    sky.style.setProperty('--moon', clamp((t - 2.4) / 0.6, 0, 1).toFixed(3));
    sky.classList.toggle('is-night', t >= 2.5);
    const i = Math.round(t);
    sky.dataset.moment = String(i);
    items.forEach((li, n) => li.classList.toggle('is-now', n === i));
    threads(i);
    rollClock(i);
    if (scrub) { scrub.value = String(Math.round(t * 100)); scrub.setAttribute('aria-valuetext', `${TIME[i]}, ${MOMENT[i].toLowerCase()}`); }
  }
  // Moving between moments eases the sun along the arc instead of jumping.
  function goTo(target) {
    cancelAnimationFrame(tween);
    if (reduce.matches) return render(target);
    const from = t, start = performance.now(), dur = 900;
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const step = (now) => {
      const f = Math.min(1, (now - start) / dur);
      render(from + (target - from) * ease(f));
      if (f < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }
  render(0);
  if (scrub) scrub.addEventListener('input', () => { cancelAnimationFrame(tween); render(Number(scrub.value) / 100); });
  // Tap the sky to move on to the next moment of the day.
  sky.addEventListener('click', () => goTo((Math.round(t) + 1) % 4));
  onScreen(sky, (seen) => sky.classList.toggle('is-offscreen', !seen), { threshold: 0 });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) goTo(Number(en.target.dataset.at));
    }, { rootMargin: '-45% 0px -45% 0px' });
    items.forEach((li) => io.observe(li));
  }

  const thread = document.querySelector('.timeline[data-reveal]');
  if (reduce.matches) thread.classList.add('is-in');
  else onScreen(thread, (seen) => seen && thread.classList.add('is-in'), { threshold: 0.2 });
}

/* ---------- Try a question: answers from the prototype's sample data ---------- */
const AREAS = {
  work: {
    q: "What did I promise in yesterday's meetings?", yarns: ['notes', 'tasks'], check: 'Checked your notes and to-dos',
    head: "Two things from yesterday's team sync.",
    items: [['notes', 'Send the revised budget to the design team', 'Due today. Not on your to-dos yet.'], ['tasks', "Confirm Friday's venue booking", 'Already on your to-dos.']],
  },
  week: {
    q: 'When can I fit in a workout today?', yarns: ['calendar', 'workout'], check: 'Checked your calendar and workout plan',
    head: 'A 45 minute run fits from 6:15 to 7:00 pm.',
    items: [['calendar', 'Your focus block ends at 6:00', "You're free until dinner at 7:30."], ['workout', 'Your plan says runs are 45 minutes', 'Best between 6 and 8 pm, with 15 minutes spare.']],
  },
  money: {
    q: 'How much did I spend on food last week?', yarns: ['money', 'calendar'], check: 'Checked your bank statement and calendar',
    head: '₹5,080 across 8 purchases.',
    items: [['money', 'Biggest day: Thursday, ₹2,060', 'The night of the team dinner.'], ['money', 'Dining out came to ₹2,860', 'Groceries ₹1,240, delivery ₹980.']],
  },
  email: {
    later: true, q: "Who's still waiting for a reply?", yarns: ['email'], check: 'Email is not connected yet',
    head: 'Email is next on the list.',
    items: [['email', "Weave can't read email in this prototype", 'When it can, it will only look when you ask.']],
  },
  home: {
    later: true, q: 'Which bills are due before Sunday?', yarns: ['home'], check: 'Home apps are not connected yet',
    head: 'Home apps come after email.',
    items: [['home', 'Bills, warranties and repairs', 'Each one will need your OK to connect.']],
  },
};

function demo() {
  const root = document.querySelector('[data-demo]');
  if (!root) return null;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const screen = root.querySelector('.screen');
  const qEl = screen.querySelector('[data-q]');
  const yarnsEl = screen.querySelector('[data-check] .yarns');
  const checkText = screen.querySelector('[data-check-text]');
  const answer = screen.querySelector('[data-a]');
  let token = 0;

  function fill(a) {
    screen.classList.toggle('is-later', Boolean(a.later));
    yarnsEl.replaceChildren(...a.yarns.map((y) => { const s = document.createElement('span'); s.dataset.yarn = y; return s; }));
    checkText.textContent = a.check;
    const head = document.createElement('p');
    head.className = 'screen-head';
    head.textContent = a.head;
    const list = document.createElement('ul');
    list.className = 'screen-list';
    for (const [yarn, strong, line] of a.items) {
      const li = document.createElement('li');
      li.dataset.yarn = yarn;
      const s = document.createElement('strong');
      s.textContent = strong;
      const sp = document.createElement('span');
      sp.textContent = line;
      li.append(s, sp);
      list.append(li);
    }
    answer.replaceChildren(head, list);
  }

  async function play(key) {
    const my = ++token;
    const a = AREAS[key];
    fill(a);
    if (reduce.matches) { qEl.textContent = a.q; screen.classList.remove('is-asking', 'is-checking'); return; }
    screen.setAttribute('aria-busy', 'true');
    screen.classList.add('is-asking');
    qEl.classList.add('is-typing');
    qEl.textContent = '';
    for (let i = 1; i <= a.q.length; i++) {
      if (my !== token) return;
      qEl.textContent = a.q.slice(0, i);
      await sleep(20);
    }
    qEl.classList.remove('is-typing');
    await sleep(250);
    if (my !== token) return;
    screen.classList.replace('is-asking', 'is-checking');
    await sleep(650);
    if (my !== token) return;
    screen.classList.remove('is-checking');
    screen.setAttribute('aria-busy', 'false');
  }

  function select(tab, focus = false) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    screen.setAttribute('aria-labelledby', tab.id);
    if (focus) tab.focus();
    play(tab.dataset.area);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const keys = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      select(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
    });
  });
  // The first answer plays once when the demo comes into view.
  let played = false;
  onScreen(screen, (seen) => { if (seen && !played) { played = true; play('work'); } }, { threshold: 0.5 });
  return {
    show(key) {
      const tab = tabs.find((t) => t.dataset.area === key);
      if (!tab) return;
      played = true;
      root.closest('section').scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
      select(tab);
      tab.focus({ preventScroll: true });
    },
  };
}

/* ---------- Control: press the buttons, watch the calendar ---------- */
function control() {
  const box = document.querySelector('[data-control]');
  if (!box) return;
  const ev = box.querySelector('[data-new]');
  const actions = box.querySelector('[data-actions]');
  const result = box.querySelector('[data-result]');
  const whenCard = box.querySelector('.confirm-when [data-when]');
  const whenCal = ev.querySelector('[data-when]');
  const button = (act, label, cls) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: `btn ${cls} btn-sm`, textContent: label });
    b.dataset.act = act;
    return b;
  };

  function times() {
    const moved = ev.classList.contains('is-moved');
    whenCard.textContent = moved ? '6:30 to 7:15 pm' : '6:15 to 7:00 pm';
    whenCal.textContent = moved ? '6:30 to 7:15' : '6:15 to 7:00';
  }
  function proposed(focus) {
    ev.classList.remove('is-added', 'is-gone');
    result.textContent = '';
    result.className = 'confirm-result';
    const moved = ev.classList.contains('is-moved');
    actions.replaceChildren(button('yes', 'Yes, add it', 'btn-primary'), button('move', moved ? 'Back to 6:15' : 'Make it 6:30', 'btn-quiet'), button('no', 'Not now', 'btn-link'));
    if (focus) actions.querySelector('[data-act="yes"]').focus();
  }
  function decided(state) {
    ev.classList.toggle('is-added', state === 'yes');
    ev.classList.toggle('is-gone', state === 'no');
    result.className = `confirm-result${state === 'yes' ? ' is-yes' : ''}`;
    result.textContent = state === 'yes' ? 'Added to your calendar.' : 'Left off your calendar. Nothing changed.';
    actions.replaceChildren(button('undo', 'Undo', 'btn-quiet'));
    actions.querySelector('button').focus();
  }
  actions.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'yes' || act === 'no') decided(act);
    else if (act === 'move') { ev.classList.toggle('is-moved'); times(); proposed(false); actions.querySelector('[data-act="move"]').focus(); }
    else if (act === 'undo') proposed(true);
  });
}

/* ---------- Close: a woven cloth that moves like fabric ---------- */
// Warp threads in the apps' yarns, weft in fine chalk. Each crossing is a point on a damped wave grid:
// it springs back to rest and pulls on its neighbours, so a push travels through the cloth as a ripple.
function field() {
  const canvas = document.querySelector('[data-field]');
  if (!canvas) return { pulse() {} };
  const host = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const YARNS = ['--yarn-calendar', '--yarn-notes', '--yarn-tasks-night', '--yarn-workout', '--yarn-email'].map((v) => css.getPropertyValue(v).trim());
  const WEFT = css.getPropertyValue('--color-on-night').trim();
  const YARN_INDEX = { calendar: 0, notes: 1, tasks: 2, money: 3, workout: 3, email: 4 };
  const glow = new Float32Array(5);
  const pulses = [];
  let W = 0, H = 0, dpr = 1, SP = 26, cols = 0, rows = 0;
  let dx = new Float32Array(0), dy = dx, vx = dx, vy = dx;
  let px = -1e4, py = -1e4, lx = 0, ly = 0, pvx = 0, pvy = 0, inside = false, visible = false, raf = 0;
  const X = (c) => (c - 1) * SP;
  const Y = (r) => (r - 1) * SP;

  function resize() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    SP = W < 640 ? 34 : 26;
    cols = Math.ceil(W / SP) + 3; rows = Math.ceil(H / SP) + 3;
    const n = cols * rows;
    dx = new Float32Array(n); dy = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
    draw();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    ctx.strokeStyle = WEFT;
    ctx.globalAlpha = 0.09;
    for (let r = 0; r < rows; r++) {
      ctx.beginPath();
      for (let c = 0; c < cols; c++) { const i = r * cols + c; const x = X(c) + dx[i], y = Y(r) + dy[i]; if (c) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.lineWidth = 1.6;
    for (let c = 0; c < cols; c++) {
      const k = Math.floor(c / 6) % 5;
      ctx.strokeStyle = YARNS[k];
      ctx.globalAlpha = Math.min(0.95, 0.24 + glow[k] * 0.65);
      ctx.beginPath();
      for (let r = 0; r < rows; r++) { const i = r * cols + c; const x = X(c) + dx[i], y = Y(r) + dy[i]; if (r) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function step(now) {
    for (const p of pulses) p.r = (now - p.t0) * 0.55;
    while (pulses.length && pulses[0].r > Math.hypot(W, H) + 60) pulses.shift();
    const C = 0.24, K = 0.014, D = 0.93, R = 130, R2 = R * R;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        let ax = ((dx[i - 1] + dx[i + 1] + dx[i - cols] + dx[i + cols]) * 0.25 - dx[i]) * C - dx[i] * K;
        let ay = ((dy[i - 1] + dy[i + 1] + dy[i - cols] + dy[i + cols]) * 0.25 - dy[i]) * C - dy[i] * K;
        const x = X(c), y = Y(r);
        if (inside) {
          const ex = x - px, ey = y - py, d2 = ex * ex + ey * ey;
          if (d2 < R2) { const f = 1 - Math.sqrt(d2) / R; ax += pvx * f * 0.05; ay += pvy * f * 0.05; }
        }
        for (const p of pulses) {
          const ex = x - p.x, ey = y - p.y, d = Math.hypot(ex, ey) || 1, band = Math.abs(d - p.r);
          if (band < 34) { const s = (1 - band / 34) * p.s * Math.max(0, 1 - p.r / 1100); ax += (ex / d) * s; ay += (ey / d) * s; }
        }
        vx[i] = (vx[i] + ax) * D;
        vy[i] = (vy[i] + ay) * D;
      }
    }
    let energy = 0;
    for (let i = 0; i < dx.length; i++) { dx[i] += vx[i]; dy[i] += vy[i]; energy += Math.abs(vx[i]) + Math.abs(vy[i]); }
    for (let k = 0; k < 5; k++) glow[k] *= 0.965;
    pvx *= 0.75; pvy *= 0.75;
    draw();
    const active = energy > 0.4 || pulses.length || glow.some((g) => g > 0.02) || (inside && Math.abs(pvx) + Math.abs(pvy) > 0.05);
    raf = visible && active ? requestAnimationFrame(step) : 0;
  }
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(step); };
  const ripple = (x, y, s) => { pulses.push({ x, y, s, r: 0, t0: performance.now() }); kick(); };

  new ResizeObserver(resize).observe(host);
  const api = {
    // An app's read sends a wave out from its threads and lights them.
    pulse(yarn) {
      if (reduce.matches || !W) return;
      const k = YARN_INDEX[yarn] ?? 1;
      glow[k] = 1;
      let best = 0, bestD = Infinity;
      for (let g = 0; g * 6 < cols; g++) if (g % 5 === k) { const d = Math.abs(X(g * 6 + 3) - W * 0.55); if (d < bestD) { bestD = d; best = g; } }
      ripple(X(best * 6 + 3), H * 0.45, 0.9);
    },
  };
  if (reduce.matches) return api; // a still cloth, drawn once per size
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (inside) { pvx = pvx * 0.5 + (x - lx) * 0.5; pvy = pvy * 0.5 + (y - ly) * 0.5; }
    lx = x; ly = y; px = x; py = y; inside = true;
    kick();
  });
  host.addEventListener('pointerleave', () => { inside = false; kick(); });
  host.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, label')) return;
    const r = host.getBoundingClientRect();
    ripple(e.clientX - r.left, e.clientY - r.top, 1.3);
  });
  onScreen(host, (seen) => {
    visible = seen;
    if (seen && !host.dataset.greeted) {
      // One wave from the mark greets the visitor.
      host.dataset.greeted = '1';
      const m = host.querySelector('.closing-mark')?.getBoundingClientRect();
      const r = host.getBoundingClientRect();
      ripple(m ? m.left + m.width / 2 - r.left : W * 0.2, m ? m.top + m.height / 2 - r.top : H * 0.5, 1.1);
    }
    if (seen) kick();
  }, { threshold: 0.1 });
  return api;
}

/* ---------- Headlines rise word by word ---------- */
function words() {
  const hero = document.querySelector('.hero-title');
  const titles = [...document.querySelectorAll('main .section-title, main .closing-title')];
  const split = (el) => {
    const text = el.textContent.replace(/[ \n\t]+/g, ' ').trim();
    el.setAttribute('aria-label', text);
    const parts = text.split(' ');
    el.replaceChildren(...parts.flatMap((w, i) => {
      const outer = document.createElement('span');
      outer.className = 'w';
      outer.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.style.setProperty('--i', i);
      inner.textContent = w;
      outer.append(inner);
      return i < parts.length - 1 ? [outer, document.createTextNode(' ')] : [outer];
    }));
  };
  if (hero) split(hero);
  titles.forEach((t) => {
    split(t);
    if (reduce.matches) return;
    t.dataset.words = '';
    onScreen(t, (seen) => seen && t.classList.add('is-in'), { threshold: 0.4 });
  });
}

/* ---------- Stitch spine: scroll progress with a knot per section ---------- */
function spine() {
  const nav = document.querySelector('[data-spine]');
  if (!nav) return;
  const fill = nav.querySelector('.spine-fill');
  const SECTIONS = [['top', 'Start'], ['day', 'Your day'], ['ask', 'Try a question'], ['control', 'Your control'], ['faq', 'Questions'], ['start', 'Ask it for real']];
  const knots = SECTIONS.map(([id, label]) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'knot';
    b.setAttribute('aria-label', `Go to ${label}`);
    const tag = document.createElement('span');
    tag.className = 'knot-label';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = label;
    b.append(tag);
    b.addEventListener('click', () => el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' }));
    nav.append(b);
    return { el, b, at: 0 };
  }).filter(Boolean);
  let max = 1;
  function layout() {
    max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    for (const k of knots) {
      k.at = Math.min(1, Math.max(0, (k.el.getBoundingClientRect().top + scrollY - 80) / max));
      k.b.style.setProperty('--y', `${(k.at * 100).toFixed(2)}%`);
    }
    update();
  }
  let ticking = false;
  function update() {
    ticking = false;
    const p = Math.min(1, Math.max(0, scrollY / max));
    fill.style.setProperty('--p', p.toFixed(4));
    let current = 0;
    knots.forEach((k, i) => { const passed = p >= k.at - 0.002; k.b.classList.toggle('is-passed', passed); if (passed) current = i; });
    knots.forEach((k, i) => k.b.classList.toggle('is-current', i === current));
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  new ResizeObserver(layout).observe(document.body);
  layout();
}

/* ---------- Primary buttons lean toward the pointer ---------- */
function magnetic() {
  if (reduce.matches || !finePointer.matches) return;
  document.querySelectorAll('.btn-primary, .nav-cta').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.translate = `${((e.clientX - (r.left + r.width / 2)) * 0.18).toFixed(1)}px ${((e.clientY - (r.top + r.height / 2)) * 0.28).toFixed(1)}px`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
  });
}

/* ---------- The opening sequence can be skipped with any click or key ---------- */
function introSkip() {
  const html = document.documentElement;
  if (!html.classList.contains('is-intro')) return;
  const skip = () => html.classList.add('is-intro-done');
  addEventListener('pointerdown', skip, { once: true });
  addEventListener('keydown', skip, { once: true });
}

/* ---------- Ticker: questions people ask; each opens its answer in the demo ---------- */
function ticker(demoApi, liveApi) {
  const root = document.querySelector('[data-ticker]');
  if (!root) return;
  const list = root.querySelector('.ticker-list');
  const copy = root.querySelector('.ticker-copy');
  copy.replaceChildren(...[...list.children].map((li) => { const c = li.cloneNode(true); c.querySelector('button').tabIndex = -1; return c; }));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-area]');
    if (!b) return;
    if (liveApi && liveApi.canAsk(b.dataset.area)) liveApi.ask(b.dataset.area);
    else if (demoApi) demoApi.show(b.dataset.area);
  });
  const pause = root.querySelector('[data-ticker-pause]');
  pause.addEventListener('click', () => {
    const paused = root.classList.toggle('is-paused');
    pause.setAttribute('aria-pressed', String(paused));
    pause.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    pause.querySelector('span').textContent = paused ? 'Play' : 'Pause';
  });
  // Off screen, the band stops moving.
  onScreen(root, (seen) => root.classList.toggle('is-offscreen', !seen), { threshold: 0 });
}

/* ---------- The live finale: the real prototype, in plain words ---------- */
const SAY = {
  list_events: (a) => `Looking at your calendar${a.date ? ` for ${dayName(a.date)}` : ''}`,
  find_free_slots: () => 'Finding free time this evening',
  get_event: () => 'Opening an event',
  create_event: () => 'Drafting a calendar event for your OK',
  list_recent_notes: () => 'Reading your recent meeting notes',
  search_notes: (a) => `Searching your notes for “${a.query}”`,
  get_note: (a, s) => (s.summary && s.summary !== 'done' ? `Opening “${s.summary}”` : 'Opening a note'),
  list_tasks: () => 'Checking your to-dos',
  get_task: () => 'Opening a to-do',
  create_task: () => 'Drafting a to-do for your OK',
  summarize_spending: () => 'Adding up your spending',
  list_transactions: () => 'Going through the purchases',
};
const SHORT = {
  'What should I follow up on today, and when can I fit in a workout?': 'Follow-ups and a workout today',
  'How much did I spend on food last week, and what was happening on those days?': 'Food spending last week',
};
function dayName(iso) {
  const today = new Date();
  const d = new Date(`${iso}T00:00:00`);
  if (d.toDateString() === today.toDateString()) return 'today';
  return d.toLocaleDateString('en-GB', { weekday: 'long' });
}
// The everyday names for each app.
const PLAIN = { Calendar: 'calendar', Notes: 'notes', Tasks: 'to-dos', Money: 'bank statement' };
const plain = (app) => PLAIN[app] ?? app.toLowerCase();
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

function live(fieldApi) {
  const root = document.querySelector('[data-live]');
  if (!root) return null;
  const chips = root.querySelector('[data-live-chips]');
  const out = root.querySelector('[data-live-out]');
  let busy = false;

  let suggestions = [];
  fetch('/api/status').then((r) => (r.ok ? r.json() : Promise.reject())).then((status) => {
    suggestions = status.suggestions ?? [];
    for (const q of suggestions) {
      const b = el('button', '', SHORT[q] ?? q);
      b.type = 'button';
      b.setAttribute('aria-label', `Ask: ${q}`);
      b.addEventListener('click', () => ask(q));
      chips.append(b);
    }
  }).catch(() => {
    chips.replaceChildren(el('p', 'live-note', 'The live demo needs the Weave server running. Open the full app once it is up.'));
  });

  async function ask(q) {
    if (busy) return;
    busy = true;
    chips.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    out.setAttribute('aria-busy', 'true');
    const steps = el('ol', 'live-steps');
    out.replaceChildren(el('p', 'live-q', q), steps);
    const lines = new Map();
    let answer = null, error = null;
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev || !data) continue;
          const p = JSON.parse(data);
          if (ev === 'step') {
            let li = lines.get(p.id);
            if (!li) { li = el('li'); li.dataset.yarn = p.server; lines.set(p.id, li); steps.append(li); }
            const say = (SAY[p.tool] ?? (() => `Using ${p.app}`))(p.args ?? {}, p);
            const opened = /^get_/.test(p.tool); // the title is already in the sentence
            const right = p.kind === 'write' ? el('span', 'held', 'waits for you') : p.status === 'done' ? el('span', 'done', opened ? '' : p.summary ?? '') : p.status === 'error' ? el('span', 'done', 'could not read') : el('span', 'done', 'reading');
            li.replaceChildren(el('span', '', say), right);
            if (p.kind === 'read' && p.status === 'done') fieldApi.pulse(p.server);
          } else if (ev === 'answer') answer = p;
          else if (ev === 'error') error = p;
        }
      }
    } catch {
      error = { message: "Couldn't reach the Weave server.", hint: 'Open the full app once the server is running.' };
    }
    if (answer) out.append(renderAnswer(answer));
    if (error) out.append(el('p', 'live-error', `${error.message} ${error.hint ?? ''}`.trim()));
    out.setAttribute('aria-busy', 'false');
    chips.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    busy = false;
  }

  // Which live question answers a ticker area: the workday question or the spending one.
  const forArea = (area) => suggestions.find((q) => (area === 'money' ? /spen[dt]|food/i : /follow|workout/i).test(q) && ['work', 'week', 'money'].includes(area));
  const api = {
    canAsk: (area) => Boolean(forArea(area)),
    ask(area) {
      root.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
      ask(forArea(area));
    },
  };

  function renderAnswer(a) {
    const box = el('div', 'live-answer');
    box.append(el('h3', '', a.headline));
    const apps = new Map(a.sources.map((s) => [s.source_id, s.app]));
    const ul = el('ul');
    for (const sec of a.sections) for (const it of sec.items) {
      const li = el('li', '', it.text);
      const from = [...new Set(it.sourceIds.map((id) => apps.get(id)).filter(Boolean))];
      if (from.length) li.append(el('span', 'from', `From your ${from.map(plain).join(' and ')}`));
      ul.append(li);
    }
    box.append(ul);
    for (const c of a.caveats ?? []) box.append(el('p', 'from', c));
    for (const d of a.proposals ?? []) box.append(renderDraft(d));
    return box;
  }

  function renderDraft(d) {
    const box = el('div', 'live-draft');
    const args = d.args ?? {};
    const ask = d.tool === 'create_event'
      ? `Add “${args.title}” to your calendar, ${args.start} to ${args.end}?`
      : `Add “${args.title}” to your to-dos${args.due ? `, due ${dayName(args.due)}` : ''}?`;
    const row = el('div', 'row');
    const yes = el('button', 'btn btn-primary btn-sm', 'Yes, add it');
    const no = el('button', 'btn btn-link btn-sm', 'Not now');
    yes.type = 'button'; no.type = 'button';
    row.append(yes, no);
    box.append(el('p', '', ask), row);
    const settle = (text, ok) => { box.classList.toggle('is-done', ok); row.replaceChildren(el('span', ok ? 'ok' : 'from', text)); };
    yes.addEventListener('click', async () => {
      yes.disabled = true; no.disabled = true;
      try {
        const r = await fetch(`/api/proposals/${encodeURIComponent(d.id)}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: {} }) });
        const j = await r.json();
        const st = j.proposal?.status;
        if (st === 'done') { settle(`Added, and checked in your ${plain(d.app)}.`, true); fieldApi.pulse(d.server); }
        else if (st === 'unverified') settle(`Added, but Weave couldn't double-check it.`, false);
        else settle(j.error ?? `${d.app} didn't accept it. Nothing changed.`, false);
      } catch { settle("Couldn't reach the Weave server. Nothing changed.", false); }
    });
    no.addEventListener('click', async () => {
      yes.disabled = true; no.disabled = true;
      try { await fetch(`/api/proposals/${encodeURIComponent(d.id)}/dismiss`, { method: 'POST' }); } catch { /* nothing to undo */ }
      settle('Left out. Nothing changed.', false);
    });
    return box;
  }
  return api;
}

introSkip();
words();
heroPointer();
day();
const demoApi = demo();
control();
const liveApi = live(field());
ticker(demoApi, liveApi);
spine();
magnetic();
