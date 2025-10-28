'use client';

import { ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.querySelector('[data-scroll-container]') as HTMLElement | null;
    setContainer(el);
    const onScroll = () => {
      if (!el) return;
      setVisible(el.scrollTop > 300);
    };
    el?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el?.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = () => {
    container?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      aria-label="回到顶部"
      onClick={handleClick}
      data-liquid
      className="hidden md:flex fixed z-[1200] right-6 rounded-full shadow-xl border px-3 py-2 items-center justify-center hover:scale-105 transition-transform"
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      <ChevronUp className="w-5 h-5 text-gray-700 dark:text-gray-200" />
    </button>
  );
}