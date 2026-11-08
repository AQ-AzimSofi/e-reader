/**
 * Cover image for one library book, read from the private BookCovers bucket.
 *
 * Deliberately public: CloudFront's cache key ignores cookies, so a cached cover is
 * served to everyone anyway, and covers are the publishers' public artwork. The
 * s-maxage lets CloudFront answer repeat requests without invoking the server.
 */

import { NextResponse } from 'next/server';
import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

// A day, so a corrected cover replaces a wrong one without a CloudFront invalidation.
const COVER_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';
const MISSING_CACHE_CONTROL = 'public, max-age=300, s-maxage=300';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get('fileName');
  const directory = searchParams.get('directory');
  if (!fileName || !directory) {
    return NextResponse.json({ error: 'fileName and directory are required' }, { status: 400 });
  }

  const bucket = process.env.BOOK_COVERS_BUCKET;
  if (!bucket) {
    console.error('BOOK_COVERS_BUCKET is not configured');
    return NextResponse.json({ error: 'Cover storage is not configured' }, { status: 500 });
  }

  try {
    const cover = await new S3Client({}).send(
      new GetObjectCommand({ Bucket: bucket, Key: `covers/${directory}/${fileName}.jpg` })
    );
    if (!cover.Body) {
      throw new Error(`Empty cover object for ${directory}/${fileName}`);
    }
    return new NextResponse(cover.Body.transformToWebStream(), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': COVER_CACHE_CONTROL },
    });
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return NextResponse.json(
        { error: 'No cover for this book' },
        { status: 404, headers: { 'Cache-Control': MISSING_CACHE_CONTROL } }
      );
    }
    console.error('Failed to load cover:', error);
    return NextResponse.json({ error: 'Failed to load cover' }, { status: 500 });
  }
}
