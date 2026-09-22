"use client";

import { CarFront } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { CarImage } from "@/features/cars/types/car.types";

interface CarImageGalleryProps {
  carName: string;
  images: CarImage[];
}

export function CarImageGallery({ carName, images }: CarImageGalleryProps) {
  const orderedImages = useMemo(
    () => [...images].sort((first, second) => Number(second.isDefault) - Number(first.isDefault)),
    [images],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const selectedImage = orderedImages[selectedIndex];
  const selectedImageFailed = selectedImage && failedImageIds.includes(selectedImage.id);

  if (!selectedImage || selectedImageFailed) {
    return (
      <div
        role="img"
        aria-label={`${carName} image unavailable`}
        className="grid aspect-[16/10] place-items-center rounded-card border border-border bg-surface-elevated text-muted shadow-card"
      >
        <div className="grid gap-3 text-center">
          <CarFront aria-hidden="true" className="mx-auto" size={42} strokeWidth={1.35} />
          <span className="text-sm font-medium">Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <section aria-label={`${carName} image gallery`}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-card border border-white/80 bg-surface-elevated shadow-card">
        <Image
          key={selectedImage.id}
          src={selectedImage.url}
          alt={`${carName}, image ${selectedIndex + 1}`}
          fill
          loading="eager"
          sizes="(min-width: 1024px) 58vw, 100vw"
          className="object-cover"
          onError={() =>
            setFailedImageIds((current) =>
              current.includes(selectedImage.id) ? current : [...current, selectedImage.id],
            )
          }
        />
      </div>

      {orderedImages.length > 1 ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-label="Choose car image">
          {orderedImages.map((image, index) => {
            const isSelected = index === selectedIndex;
            const isFailed = failedImageIds.includes(image.id);

            return (
              <button
                key={image.id}
                type="button"
                aria-label={`Show image ${index + 1} of ${carName}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "relative h-16 w-24 shrink-0 overflow-hidden rounded-control border bg-surface outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[var(--ring)] sm:h-20 sm:w-32",
                  isSelected
                    ? "border-accent-secondary shadow-[0_0_0_2px_rgba(48,93,104,0.18)]"
                    : "border-border hover:border-accent-secondary/50",
                )}
              >
                {isFailed ? (
                  <span className="grid h-full place-items-center text-muted">
                    <CarFront aria-hidden="true" size={19} />
                  </span>
                ) : (
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="128px"
                    className="object-cover"
                    onError={() =>
                      setFailedImageIds((current) =>
                        current.includes(image.id) ? current : [...current, image.id],
                      )
                    }
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
