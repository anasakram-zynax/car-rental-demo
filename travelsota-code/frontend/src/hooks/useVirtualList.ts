'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface UseVirtualListReturn {
  virtualItems: Array<{ index: number; offsetTop: number }>;
  containerProps: {
    style: { height: string; position: 'relative'; overflow: 'auto' };
  };
  wrapperProps: {
    style: { height: string; position: 'relative' };
  };
  scrollToIndex: (index: number) => void;
}

/**
 * Lightweight virtual list hook using IntersectionObserver pattern.
 * Only renders items visible in viewport + overscan buffer.
 */
export function useVirtualList({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 5,
}: UseVirtualListOptions): UseVirtualListReturn {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const totalHeight = itemCount * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );

  const virtualItems = useMemo(() => {
    const items = [];
    for (let i = startIndex; i < endIndex; i++) {
      items.push({ index: i, offsetTop: i * itemHeight });
    }
    return items;
  }, [startIndex, endIndex, itemHeight]);

  const scrollToIndex = useCallback((index: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = index * itemHeight;
    }
  }, [itemHeight]);

  return {
    virtualItems,
    containerProps: {
      style: {
        height: `${containerHeight}px`,
        position: 'relative',
        overflow: 'auto',
      },
    },
    wrapperProps: {
      style: {
        height: `${totalHeight}px`,
        position: 'relative',
      },
    },
    scrollToIndex,
  };
}

/**
 * Hook for lazy rendering with IntersectionObserver.
 * Component only renders when visible in viewport.
 */
export function useLazyRender(rootMargin = '200px'): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, isVisible];
}
