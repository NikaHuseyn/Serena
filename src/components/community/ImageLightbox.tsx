import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface LightboxImage {
  url: string;
  label?: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  startIndex?: number;
  open: boolean;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ images, startIndex = 0, open, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, images.length, onClose]);

  if (!open || images.length === 0) return null;

  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absY > 60 && absY > absX && dy > 0) {
      onClose();
    } else if (absX > 50 && absX > absY) {
      if (dx < 0 && hasNext) setIndex(i => i + 1);
      else if (dx > 0 && hasPrev) setIndex(i => i - 1);
    }
    touchStart.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"
      >
        <X className="h-5 w-5" />
      </button>

      {current.label && (
        <div className="absolute top-4 left-4 z-10 bg-white/10 backdrop-blur-sm text-white text-sm font-medium px-3 py-1.5 rounded">
          {current.label}
        </div>
      )}

      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white/10 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded">
          {index + 1}/{images.length}
        </div>
      )}

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex(i => i - 1); }}
          aria-label="Previous"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex(i => i + 1); }}
          aria-label="Next"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <img
        src={current.url}
        alt={current.label || `Image ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[95vw] object-contain select-none"
      />
    </div>
  );
};

export default ImageLightbox;
