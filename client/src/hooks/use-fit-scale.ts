import { useEffect, useState } from 'react';

/** width×height 화면을 창 안에 비율을 지켜 꽉 차게 넣는 배율 */
export function useFitScale(width: number, height: number) {
  const [scale, setScale] = useState(() => fit(width, height));
  useEffect(() => {
    const resize = () => setScale(fit(width, height));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [width, height]);
  return scale;
}

function fit(width: number, height: number) {
  return Math.min(window.innerWidth / width, window.innerHeight / height);
}
