/**
 * Server-rendered public photo. Approved uploads are already WebP/AVIF; the
 * fixed intrinsic ratio prevents layout shift while the parent supplies the
 * warm design-system placeholder behind the image.
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
  return (
    // eslint-disable-next-line @next/next/no-img-element -- approved media is already optimized; avoiding next/image hydration is intentional.
    <img
      data-public-image
      src={src}
      alt={alt}
      width={1200}
      height={800}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      sizes={sizes}
      className={`absolute inset-0 h-full w-full ${className ?? ""}`}
    />
  );
}
