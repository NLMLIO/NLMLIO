import { useLayoutEffect, useState, type RefObject } from 'react';

/** 컨테이너 실제 크기와 모바일의 보이는 영역 중 작은 크기로 맞춘다. */
export function useFitScale(
  width: number,
  height: number,
  container: RefObject<HTMLDivElement | null>,
) {
  const [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const element = container.current;
      if (!element) return;
      const viewport = window.visualViewport;
      const availableWidth = Math.min(element.clientWidth, viewport?.width ?? window.innerWidth);
      const availableHeight = Math.min(
        element.clientHeight,
        viewport?.height ?? window.innerHeight,
      );
      const scale = Math.max(0, Math.min(availableWidth / width, availableHeight / height));
      setFit(scale);
    };
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [width, height, container]);
  return fit;
}
