import type { PhotoDTO } from "@/lib/public-read/dto";

/**
 * Photo hero (CP4). CP4 fixtures carry no image files, so this is the warm gradient
 * placeholder from the design system (photo-forward, never stock imagery, PRD §8). Real
 * vendor photos + next/image + the alt/EN-fallback rendering land in a later slice; the
 * DTO already carries the URLs + alt (and JSON-LD `image`) for that.
 */
export function PhotoGallery({ photos }: { photos: PhotoDTO[] }) {
  if (photos.length === 0) return null;
  return <div className="photo-placeholder aspect-[1.9/1] w-full rounded-card" aria-hidden />;
}
