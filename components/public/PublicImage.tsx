"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Public-photo renderer with a quiet failure mode. Approved media can still be
 * temporarily unavailable at its CDN URL; in that case the parent's warm photo
 * placeholder remains visible instead of exposing a broken-image glyph.
 */
export function PublicImage({
  src,
  alt,
  priority = false,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      unoptimized
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
