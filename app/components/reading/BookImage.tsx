"use client";

import React, { useState } from 'react';
import { COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';
import { bookAssetUrl } from '@/lib/utils/bookAssetPath';

interface BookImageProps {
  fileName: string;
  imagePath: string;
  altText?: string;
  chapterName?: string;
  onUnavailable?: () => void;
}

const BookImage: React.FC<BookImageProps> = ({
  fileName,
  imagePath,
  altText,
  chapterName,
  onUnavailable,
}) => {
  const imageUrl = bookAssetUrl(imagePath);
  // Tracked per URL: the metadata that maps an EPUB image name to its extracted file
  // can arrive after the first render, and a failure for the unmapped name must not stick.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const isLoading = loadedUrl !== imageUrl;

  // Some books reference illustrations whose source files were never kept; a
  // placeholder there is not something the reader can act on, so the text just continues.
  if (failedUrl === imageUrl) {
    return null;
  }

  return (
    <div className="my-4 flex flex-col items-center">
      <div
        className="relative overflow-hidden border max-w-full"
        style={{
          borderColor: toTint(COLORS.SECONDARY, 35),
          backgroundColor: isLoading ? toTint(COLORS.SECONDARY, 8) : 'transparent',
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p style={{ color: COLORS.SECONDARY }}>画像を読み込んでいます...</p>
          </div>
        )}
        <img
          src={imageUrl}
          alt={altText || fileName}
          onLoad={() => setLoadedUrl(imageUrl)}
          onError={() => {
            setFailedUrl(imageUrl);
            onUnavailable?.();
          }}
          className="max-w-full h-auto"
          style={{
            display: isLoading ? 'none' : 'block',
            maxHeight: '800px',
            objectFit: 'contain',
          }}
        />
      </div>
      {chapterName && !isLoading && (
        <p
          className="text-sm mt-2 text-center"
          style={{ color: COLORS.SECONDARY }}
        >
          {chapterName}
        </p>
      )}
    </div>
  );
};

export default BookImage;
