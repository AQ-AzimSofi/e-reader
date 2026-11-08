"use client";

import React, { useState } from 'react';
import { CSS_VARS } from '@/lib/constants';
import { bookAssetUrl } from '@/lib/utils/bookAssetPath';

interface BookImageProps {
  fileName: string;
  imagePath: string;
  altText?: string;
  chapterName?: string;
}

const BookImage: React.FC<BookImageProps> = ({
  fileName,
  imagePath,
  altText,
  chapterName,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const imageUrl = bookAssetUrl(imagePath);

  // Some books reference illustrations whose source files were never kept; a
  // placeholder there is not something the reader can act on, so the text just continues.
  if (hasError) {
    return null;
  }

  return (
    <div className="my-4 flex flex-col items-center">
      <div
        className="relative rounded-lg overflow-hidden border max-w-full"
        style={{
          borderColor: CSS_VARS.NEUTRAL,
          backgroundColor: isLoading ? CSS_VARS.BASE : 'transparent',
        }}
      >
        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: CSS_VARS.BASE }}
          >
            <p style={{ color: CSS_VARS.NEUTRAL }}>画像を読み込んでいます...</p>
          </div>
        )}
        <img
          src={imageUrl}
          alt={altText || fileName}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className="max-w-full h-auto"
          style={{
            display: isLoading ? 'none' : 'block',
            maxHeight: '800px',
            objectFit: 'contain',
          }}
        />
      </div>
      {chapterName && !isLoading && !hasError && (
        <p
          className="text-sm mt-2 text-center"
          style={{ color: CSS_VARS.NEUTRAL }}
        >
          {chapterName}
        </p>
      )}
    </div>
  );
};

export default BookImage;
