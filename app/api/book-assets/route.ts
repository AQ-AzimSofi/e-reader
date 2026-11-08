/**
 * Illustrations and image metadata from inside a book, read from the private
 * BookImages bucket.
 *
 * `?path=` keeps the layout these files had under public/ (`/<directory>/images/<file>`
 * and the book's metadata `.json`), so the reader's path logic is unchanged.
 * Signed-in readers may load any book; guests only the preview books. Responses are
 * `private` because CloudFront's cache key ignores the session: a shared cache would
 * hand a signed-in reader's illustrations to guests.
 */

import { NextResponse } from 'next/server';
import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { isAuthenticated } from '@/lib/auth/apiSession';
import { isPublicBookAsset } from '@/lib/publicBooks';

export const dynamic = 'force-dynamic';

const ASSET_CACHE_CONTROL = 'private, max-age=86400';
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  json: 'application/json',
};

function contentTypeOf(assetPath: string): string | undefined {
  const extension = assetPath.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXTENSION[extension];
}

function isWellFormedAssetPath(assetPath: string): boolean {
  return assetPath.startsWith('/') && !assetPath.includes('\\') && !assetPath.split('/').includes('..');
}

export async function GET(request: Request) {
  const assetPath = new URL(request.url).searchParams.get('path');
  const contentType = assetPath ? contentTypeOf(assetPath) : undefined;
  if (!assetPath || !contentType || !isWellFormedAssetPath(assetPath)) {
    return NextResponse.json({ error: 'path must point to a book image or metadata file' }, { status: 400 });
  }

  if (!isPublicBookAsset(assetPath) && !(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bucket = process.env.BOOK_IMAGES_BUCKET;
  if (!bucket) {
    console.error('BOOK_IMAGES_BUCKET is not configured');
    return NextResponse.json({ error: 'Book image storage is not configured' }, { status: 500 });
  }

  try {
    const asset = await new S3Client({}).send(
      new GetObjectCommand({ Bucket: bucket, Key: assetPath.slice(1) })
    );
    if (!asset.Body) {
      throw new Error(`Empty book asset ${assetPath}`);
    }
    // Copied into an ArrayBuffer-backed array, which BodyInit accepts.
    const assetBytes = new Uint8Array(await asset.Body.transformToByteArray());
    return new NextResponse(assetBytes, {
      headers: { 'Content-Type': contentType, 'Cache-Control': ASSET_CACHE_CONTROL },
    });
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return NextResponse.json({ error: 'No such book asset' }, { status: 404 });
    }
    console.error('Failed to load book asset:', error);
    return NextResponse.json({ error: 'Failed to load book asset' }, { status: 500 });
  }
}
