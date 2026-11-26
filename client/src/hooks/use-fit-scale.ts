import { useLayoutEffect, useState, type RefObject } from 'react';

export interface FitScale {
  /** 기준 크기를 창에 맞추는 배율 */
  scale: number;
  /**
   * 기준 좌표계로 센 화면 폭. 창이 기준 비율(가로가 더 긴 16:9 등)보다 가로로 길면 기준 폭보다 커져,
   * 좌우 여백 없이 창 폭을 모두 채운다. 기준 비율보다 좁으면 기준 폭 그대로다.
   */
  stageWidth: number;
}

/** 컨테이너 실제 크기와 모바일의 보이는 영역 중 작은 크기로 맞춘다. */
export function useFitScale(
  width: number,
  height: number,
  container: RefObject<HTMLDivElement | null>,
): FitScale {
  const [fit, setFit] = useState<FitScale>({ scale: 0, stageWidth: width });
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
      const stageWidth = scale > 0 ? Math.max(width, availableWidth / scale) : width;
      setFit((current) =>
        current.scale === scale && current.stageWidth === stageWidth
          ? current
          : { scale, stageWidth },
      );
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
