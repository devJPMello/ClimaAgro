import { useEffect, useRef, useState } from 'react';

interface LazyRenderProps {
  children: React.ReactNode;
  /** Altura do skeleton antes de entrar em viewport */
  height?: number | string;
  className?: string;
}

export function LazyRender({ children, height = 300, className }: LazyRenderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        children
      ) : (
        <div
          className="w-full animate-pulse rounded-lg bg-muted/40"
          style={{ height }}
          aria-hidden
        />
      )}
    </div>
  );
}
