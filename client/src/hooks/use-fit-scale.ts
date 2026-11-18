import { useLayoutEffect, useState, type RefObject } from 'react';

/** 컨테이너 실제 크기와 모바일의 보이는 영역 중 작은 크기로 맞춘다. */
export function useFitScale(
  width: number,
  height: number,
  container: RefObject<HTMLDivElement | null>,
) {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const fit = () => {
      const element = container.current;
      if (!element) return;
      const viewport = window.visualViewport;
      setScale(
        Math.max(
          0,
          Math.min(
            Math.min(element.clientWidth, viewport?.width ?? window.innerWidth) / width,
            Math.min(element.clientHeight, viewport?.height ?? window.innerHeight) / height,
          ),
        ),
      );
    };
    const observer = new ResizeObserver(fit);
    if (container.current) observer.observe(container.current);
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, [width, height, container]);
  return scale;
}
