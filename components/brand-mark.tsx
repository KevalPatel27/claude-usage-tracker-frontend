import Image from 'next/image';

/** Decorative alongside the visible wordmark; no duplicate screen-reader announcement. */
export function BrandMark({size=40}:{size?:number}) {
 return <Image className="brand-mark" src="/brand/mark.svg" width={size} height={size} alt="" aria-hidden="true" unoptimized/>;
}
