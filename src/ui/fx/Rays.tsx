import type { CSSProperties, Ref } from 'react';

/**
 * Light rays (rays.ts) as an image element: Safari draws an image straight from its small picture
 * however big it shows, where a big box with the rays as its background was redrawn at full size.
 */
export function Rays({ url, className, style, imgRef }: { url: string; className?: string; style?: CSSProperties; imgRef?: Ref<HTMLImageElement> }) {
  return <img ref={imgRef} src={url} alt="" aria-hidden draggable={false} data-rays className={className} style={style} />;
}
