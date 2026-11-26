import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Sets `html[data-page]`, page <title>, and <meta name="description"> synchronously on route entry.
 */
export function usePageMeta({ page, title, description }) {
  useLayoutEffect(() => {
    document.documentElement.dataset.page = page;
    if (title) document.title = title;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', description);
    }
  }, [page, title, description]);
}

/**
 * Subtle magnetic pointer lean on landing page primary/nav buttons (fine pointer & motion enabled).
 */
export function useMagneticProps() {
  const ref = useRef(null);

  const onPointerMove = (e) => {
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !matchMedia('(pointer: fine)').matches
    ) {
      return;
    }
    const node = ref.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const dx = ((e.clientX - (r.left + r.width / 2)) * 0.18).toFixed(1);
    const dy = ((e.clientY - (r.top + r.height / 2)) * 0.28).toFixed(1);
    node.style.translate = `${dx}px ${dy}px`;
  };

  const onPointerLeave = () => {
    if (ref.current) ref.current.style.translate = '';
  };

  return { ref, onPointerMove, onPointerLeave };
}

/**
 * Fires callback when element enters/leaves viewport via IntersectionObserver.
 */
export function useOnScreen(ref, callback, options = { threshold: 0.25 }, deps = []) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      cbRef.current(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => cbRef.current(entry.isIntersecting, entry));
      },
      options,
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, options.threshold, options.rootMargin, ...deps]);
}

