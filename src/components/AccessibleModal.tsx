'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** Shared keyboard and focus behavior for existing modal layouts. */
export default function AccessibleModal({ children, className, onClose }: { children: ReactNode; className?: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = root.current;
    if (!element) return;
    const heading = element.querySelector('h1,h2,h3');
    if (heading) { if (!heading.id) heading.id = `modal-${crypto.randomUUID()}`; element.setAttribute('aria-labelledby', heading.id); }
    const focusable = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length > 0);
    (focusable()[0] || element).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items.at(-1);
        if (!first) { event.preventDefault(); element.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    element.addEventListener('keydown', onKey);
    return () => { element.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div ref={root} role="dialog" aria-modal="true" tabIndex={-1} className={className}>{children}</div>;
}
