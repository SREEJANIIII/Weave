export const fmt = (n) => Math.round(n * 10) / 10;

export const cubic = (a, b, c, d) =>
  `M${fmt(a.x)},${fmt(a.y)} C${fmt(b.x)},${fmt(b.y)} ${fmt(c.x)},${fmt(c.y)} ${fmt(d.x)},${fmt(d.y)}`;

export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Split a cubic at t = 0.5 so each half can sit on its own layer (over in one place, under in the next). */
export function split(p0, p1, p2, p3) {
  const a = lerp(p0, p1, 0.5);
  const b = lerp(p1, p2, 0.5);
  const c = lerp(p2, p3, 0.5);
  const d = lerp(a, b, 0.5);
  const e = lerp(b, c, 0.5);
  const m = lerp(d, e, 0.5);
  return [
    [p0, a, d, m],
    [m, e, c, p3],
  ];
}

/** Box of an element relative to a container, ignoring transforms on the element itself. */
export function boxIn(node, container) {
  let x = 0;
  let y = 0;
  let n = node;
  while (n && n !== container) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

