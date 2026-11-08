/**
 * Custom hook to load book metadata from JSON file
 *
 * Loads the .json file created by the EPUB converter and builds
 * an image mapping from original filenames to renamed filenames.
 */

import { useState, useEffect } from 'react';
import { bookAssetPath, bookAssetUrl } from '@/lib/utils/bookAssetPath';
import type { BookMetadata, ImageMap } from '@/lib/types';

interface UseBookMetadataResult {
  metadata: BookMetadata | null;
  imageMap: ImageMap;
  isLoading: boolean;
  error: Error | null;
}

export function useBookMetadata(
  fileName: string | null,
  directory: string | null
): UseBookMetadataResult {
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [imageMap, setImageMap] = useState<ImageMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!fileName || !directory) {
      setMetadata(null);
      setImageMap({});
      return;
    }

    const loadMetadata = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(bookAssetUrl(bookAssetPath(directory, fileName, '.json')));

        if (!response.ok) {
          // If JSON doesn't exist, silently fail (not all books have metadata)
          console.log(`No metadata found for ${fileName}`);
          setMetadata(null);
          setImageMap({});
          setIsLoading(false);
          return;
        }

        const data: BookMetadata = await response.json();
        setMetadata(data);

        // Build image mapping from original names to renamed files
        const map: ImageMap = {};

        data.images?.forEach((image) => {
          if (!image.originalName || !image.fileName) {
            return;
          }

          // Extract just the filename (basename) from any path
          // OEBPS/image_rsrc3F7.jpg -> image_rsrc3F7.jpg
          // images/cover.jpg -> cover.jpg
          const basename = image.originalName.split('/').pop() || image.originalName;

          // Map basename → renamed filename (this is what the text file uses)
          map[basename] = image.fileName;

          // Also add mapping with full original path for backward compatibility
          map[image.originalName] = image.fileName;

          // Strip common prefixes and add those mappings too
          const withoutPrefix = image.originalName.replace(/^(OEBPS|images?)\//i, '');
          if (withoutPrefix !== basename) {
            map[withoutPrefix] = image.fileName;
          }
        });

        setImageMap(map);
      } catch (err) {
        console.error('Error loading book metadata:', err);
        setError(err instanceof Error ? err : new Error('Failed to load metadata'));
        setMetadata(null);
        setImageMap({});
      } finally {
        setIsLoading(false);
      }
    };

    loadMetadata();
  }, [fileName, directory]);

  return { metadata, imageMap, isLoading, error };
}
