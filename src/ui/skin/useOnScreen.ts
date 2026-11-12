import { useEffect, useRef, type RefObject } from 'react';

/**
 * Whether the element is at least partly on screen (scrolled-away rack units are not). A ref, not
 * state: animation loops read it every frame and skip drawing what nobody can see.
 */
export function useOnScreen(target: RefObject<Element | null>): RefObject<boolean> {
  const onScreen = useRef(true);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      onScreen.current = entry.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return onScreen;
}
