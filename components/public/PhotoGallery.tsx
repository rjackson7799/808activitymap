import type { PhotoDTO } from "@/lib/public-read/dto";
import { PublicImage } from "./PublicImage";

/**
 * Photo hero (CP4). CP4 fixtures carry no image files, so this is the warm gradient
 * placeholder from the design system (photo-forward, never stock imagery, PRD §8). Real
 * vendor photos + next/image + the alt/EN-fallback rendering land in a later slice; the
 * DTO already carries the URLs + alt (and JSON-LD `image`) for that.
 */
export function PhotoGallery({ photos }: { photos: PhotoDTO[] }) {
  if (photos.length === 0) return null;
  const visible = photos.slice(0, 3);
  return (
    <div className="grid h-[250px] grid-cols-1 gap-2 overflow-hidden rounded-card sm:h-[380px] sm:grid-cols-[1.7fr_1fr] sm:grid-rows-2">
      {visible.map((photo, index) => (
        <div
          key={`${photo.url}-${index}`}
          className={`photo-placeholder relative overflow-hidden ${
            index === 0
              ? visible.length === 1
                ? "sm:col-span-2 sm:row-span-2"
                : "sm:row-span-2"
              : visible.length === 2
                ? "hidden sm:row-span-2 sm:block"
                : "hidden sm:block"
          }`}
        >
          <PublicImage
            src={photo.url}
            alt={photo.alt ?? ""}
            priority={index === 0}
            sizes={index === 0 ? "(max-width: 639px) 100vw, 65vw" : "35vw"}
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
