#!/usr/bin/env npx tsx
/**
 * OCR a folder of book page images into plain text with Gemini.
 *
 * Each image is transcribed once and cached as a text file, so rerunning on a folder that
 * is still growing (kindle/page-turner.ts --screenshot-dir) only sends the new pages.
 * Every run then joins all cached pages into one text file, one paragraph per line with a
 * blank line between paragraphs.
 *
 * Requests go to the free GEMINI_API_KEY* keys first. GEMINI_API_KEY_PAID is used only once
 * every free key has run out of its daily quota for the model or been rejected.
 * Rate limits, server errors and blocked replies are retried; other request errors fail the page at once.
 *
 * Usage: npx tsx scripts/ocr/ocr-pages.ts <image-dir> [--out-dir <dir>] [--model gemini-3.5-flash] [--concurrency <n>]
 *
 * Output (the out dir defaults to "<image-dir>-ocr" next to the image folder):
 *   <out-dir>/pages/<image-name>.txt   one per image; delete one to transcribe that page again
 *   <out-dir>/<image-dir-name>.txt     all pages joined
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiError, GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '.env')] });

const DEFAULT_MODEL = 'gemini-3.5-flash';
const FREE_API_KEY_ENV_NAMES = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3', 'GEMINI_API_KEY4', 'GEMINI_API_KEY5'];
const PAID_API_KEY_ENV_NAME = 'GEMINI_API_KEY_PAID';
const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const MAX_ATTEMPTS = 4;
const MAX_RETRY_WAIT_SECS = 30;

const CONTINUATION_MARKER = '<<CONTINUED>>';
const NO_TEXT_MARKER = '<<NO_TEXT>>';

const OCR_PROMPT = `この画像は電子書籍リーダーで表示した本の1ページです。本文のテキストだけを書き起こしてください。

## ルール
- 一字一句そのまま書き写す。要約・修正・補足はしない
- 縦書きは右の行から左の行へ、横書きは上の行から下の行へ読む
- 画面上部の書名や、下部の「Page 30 of 183」「Location 12 of 2218」「mins left in chapter」などのリーダーの表示は書かない
- ルビ（ふりがな）は書かず、親文字だけを書く
- 画面上の折り返しは無視して、1つの段落を1行にまとめる。段落と段落の間には空行を1つ入れる
- 見出しや目次の項目は、それぞれ独立した1行にする
- 前置き、説明、マークダウン記法は付けない
- ページが前のページの段落の途中から始まっている（最初の行に字下げがなく、文の途中から続いている）場合は、1行目に ${CONTINUATION_MARKER} とだけ書き、2行目から本文を書く
- 本文がないページ（表紙、挿絵だけのページ、白紙など）は ${NO_TEXT_MARKER} とだけ書く`;

interface CliOptions {
  imageDir: string;
  outDir: string;
  model: string;
  concurrency?: number;
}

interface ApiKey {
  envName: string;
  client: GoogleGenAI;
}

interface KeyPool {
  freeKeys: ApiKey[];
  paidKey?: ApiKey;
  // Free keys out of daily quota or rejected, skipped for the rest of the run.
  retiredFreeKeys: Set<ApiKey>;
}

interface OcrContext {
  keyPool: KeyPool;
  model: string;
  imageDir: string;
  pagesDir: string;
}

interface PageJob {
  imageName: string;
  keyIndex: number;
}

interface PageText {
  continuesPreviousPage: boolean;
  text: string;
}

function parseCliOptions(): CliOptions {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string' },
      model: { type: 'string', default: DEFAULT_MODEL },
      concurrency: { type: 'string' },
    },
  });
  const imageDir = positionals[0];
  if (!imageDir) {
    throw new Error('Usage: npx tsx scripts/ocr/ocr-pages.ts <image-dir> [--out-dir <dir>] [--model <name>] [--concurrency <n>]');
  }
  if (!existsSync(imageDir)) throw new Error(`Image folder not found: ${imageDir}`);
  const concurrency = values.concurrency === undefined ? undefined : Number(values.concurrency);
  const isValidConcurrency = concurrency === undefined || (Number.isInteger(concurrency) && concurrency > 0);
  if (!isValidConcurrency) throw new Error(`--concurrency must be a positive integer, got "${values.concurrency}"`);
  const resolvedImageDir = path.resolve(imageDir);
  return {
    imageDir: resolvedImageDir,
    // Kept outside the image folder: page-turner.ts numbers screenshots by counting that folder's entries.
    outDir: path.resolve(values['out-dir'] ?? `${resolvedImageDir}-ocr`),
    model: values.model,
    concurrency,
  };
}

function readApiKey(envName: string): ApiKey | undefined {
  const apiKey = process.env[envName];
  if (!apiKey) return undefined;
  return { envName, client: new GoogleGenAI({ apiKey }) };
}

function createKeyPool(): KeyPool {
  const freeKeys = FREE_API_KEY_ENV_NAMES.map(readApiKey).filter((key): key is ApiKey => key !== undefined);
  const paidKey = readApiKey(PAID_API_KEY_ENV_NAME);
  if (freeKeys.length === 0 && !paidKey) {
    throw new Error(`No Gemini API key found. Set ${FREE_API_KEY_ENV_NAMES.join(' / ')} in .env.local or ${PAID_API_KEY_ENV_NAME}.`);
  }
  return { freeKeys, paidKey, retiredFreeKeys: new Set() };
}

function pickKey(keyPool: KeyPool, spreadIndex: number): ApiKey | undefined {
  const availableFreeKeys = keyPool.freeKeys.filter((key) => !keyPool.retiredFreeKeys.has(key));
  if (availableFreeKeys.length === 0) return keyPool.paidKey;
  return availableFreeKeys[spreadIndex % availableFreeKeys.length];
}

/** Why the key that made the request can serve nothing more this run, or undefined when the error is not about the key. */
function describeUnusableKey(error: unknown, model: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  // A per-minute limit clears by itself; a per-day quota or a rejected key does not.
  if (error.status === 429 && error.message.includes('PerDay')) return `out of daily quota for ${model}`;
  if (error.status === 403 || error.message.includes('API_KEY_INVALID')) return `rejected (${describeError(error)})`;
  return undefined;
}

function isRetryable(error: unknown): boolean {
  // Network failures and blocked (empty) replies are not ApiErrors and can pass on a retry; any other 4xx, such as an unknown model, cannot.
  if (!(error instanceof ApiError)) return true;
  return error.status === 429 || error.status >= 500;
}

function describeFallback(keyPool: KeyPool): string {
  const remainingFreeKeyCount = keyPool.freeKeys.length - keyPool.retiredFreeKeys.size;
  if (remainingFreeKeyCount > 0) return `${remainingFreeKeyCount} free key(s) left`;
  if (keyPool.paidKey) return `switching to ${keyPool.paidKey.envName}`;
  return `no ${PAID_API_KEY_ENV_NAME} to fall back to`;
}

function retireKey(keyPool: KeyPool, key: ApiKey, reason: string): void {
  // Concurrent workers can hit the same key; report it once.
  if (keyPool.retiredFreeKeys.has(key)) return;
  keyPool.retiredFreeKeys.add(key);
  console.log(`  ${key.envName} is ${reason}; ${describeFallback(keyPool)}`);
}

async function listImageNames(imageDir: string): Promise<string[]> {
  const entries = await readdir(imageDir);
  return entries
    .filter((name) => path.extname(name).toLowerCase() in MIME_TYPE_BY_EXTENSION)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function pageTextPath(pagesDir: string, imageName: string): string {
  return path.join(pagesDir, `${path.parse(imageName).name}.txt`);
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Gemini API errors are a JSON body; the first line of its "message" field is the readable part.
  return /"message":"([^"\\]*)/.exec(message)?.[1]?.trim() ?? message;
}

async function transcribeImage(client: GoogleGenAI, model: string, imagePath: string): Promise<string> {
  const imageBase64 = (await readFile(imagePath)).toString('base64');
  const mimeType = MIME_TYPE_BY_EXTENSION[path.extname(imagePath).toLowerCase()];
  const response = await client.models.generateContent({
    model,
    contents: [{ text: OCR_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
  });
  // Read the parts directly: response.text warns on every Gemini 3 reply because of its thoughtSignature part.
  const answerParts = (response.candidates?.[0]?.content?.parts ?? []).filter((part) => part.text && !part.thought);
  const transcript = answerParts.map((part) => part.text).join('').trim();
  // A page with no text answers NO_TEXT_MARKER, so an empty reply means the request was blocked (e.g. RECITATION).
  if (!transcript) throw new Error(`empty response (finishReason: ${response.candidates?.[0]?.finishReason ?? 'unknown'})`);
  return transcript === NO_TEXT_MARKER ? '' : transcript;
}

async function transcribePage(context: OcrContext, job: PageJob, attemptNumber = 1): Promise<string> {
  // Each retry moves to the next key, so one key's transient errors do not sink the page.
  const key = pickKey(context.keyPool, job.keyIndex + attemptNumber - 1);
  if (!key) throw new Error(`no usable free key left for ${context.model} and ${PAID_API_KEY_ENV_NAME} is not set`);
  try {
    return await transcribeImage(key.client, context.model, path.join(context.imageDir, job.imageName));
  } catch (error) {
    const isFreeKey = key !== context.keyPool.paidKey;
    const unusableKeyReason = isFreeKey ? describeUnusableKey(error, context.model) : undefined;
    if (unusableKeyReason) {
      retireKey(context.keyPool, key, unusableKeyReason);
      return transcribePage(context, job, attemptNumber);
    }
    const isLastAttempt = attemptNumber >= MAX_ATTEMPTS;
    if (isLastAttempt || !isRetryable(error)) throw error;
    const waitSecs = Math.min(MAX_RETRY_WAIT_SECS, attemptNumber * 10);
    console.log(`  ${job.imageName}: attempt ${attemptNumber} failed (${describeError(error)}), retrying in ${waitSecs}s`);
    await sleep(waitSecs * 1000);
    return transcribePage(context, job, attemptNumber + 1);
  }
}

/** Returns the names of the images that could not be transcribed. */
async function transcribePages(context: OcrContext, imageNames: string[], concurrency: number): Promise<string[]> {
  const queue: PageJob[] = imageNames.map((imageName, keyIndex) => ({ imageName, keyIndex }));
  const finishedImageNames: string[] = [];
  const failedImageNames: string[] = [];

  const runWorker = async (): Promise<void> => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) return;
      try {
        const transcript = await transcribePage(context, job);
        await writeFile(pageTextPath(context.pagesDir, job.imageName), transcript);
        finishedImageNames.push(job.imageName);
        console.log(`[${finishedImageNames.length}/${imageNames.length}] ${job.imageName}: ${transcript.length} chars`);
      } catch (error) {
        finishedImageNames.push(job.imageName);
        failedImageNames.push(job.imageName);
        console.log(`[${finishedImageNames.length}/${imageNames.length}] ${job.imageName}: FAILED (${describeError(error)})`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => runWorker()));
  return failedImageNames;
}

function parsePageText(pageFileContent: string): PageText {
  const continuesPreviousPage = pageFileContent.startsWith(CONTINUATION_MARKER);
  const body = continuesPreviousPage ? pageFileContent.slice(CONTINUATION_MARKER.length) : pageFileContent;
  return { continuesPreviousPage, text: body.trim().replace(/\n+/g, '\n\n') };
}

async function readPageTexts(pagesDir: string, imageNames: string[]): Promise<PageText[]> {
  const pagePaths = imageNames.map((imageName) => pageTextPath(pagesDir, imageName)).filter((pagePath) => existsSync(pagePath));
  const pageFileContents = await Promise.all(pagePaths.map((pagePath) => readFile(pagePath, 'utf8')));
  return pageFileContents.map(parsePageText);
}

function joinPages(pages: PageText[]): string {
  return pages.reduce((joinedText, page) => {
    if (!page.text) return joinedText;
    if (!joinedText) return page.text;
    // A paragraph split by the page break is glued back together; Japanese needs no space at the seam.
    return joinedText + (page.continuesPreviousPage ? '' : '\n\n') + page.text;
  }, '');
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  const keyPool = createKeyPool();
  const pagesDir = path.join(options.outDir, 'pages');
  await mkdir(pagesDir, { recursive: true });

  const imageNames = await listImageNames(options.imageDir);
  if (imageNames.length === 0) throw new Error(`No images (${Object.keys(MIME_TYPE_BY_EXTENSION).join(', ')}) in ${options.imageDir}`);
  const pendingImageNames = imageNames.filter((imageName) => !existsSync(pageTextPath(pagesDir, imageName)));
  const concurrency = options.concurrency ?? Math.max(keyPool.freeKeys.length, 1);
  const paidKeyNote = keyPool.paidKey ? `, ${PAID_API_KEY_ENV_NAME} as fallback` : '';
  console.log(
    `${imageNames.length} images, ${imageNames.length - pendingImageNames.length} already done, ${pendingImageNames.length} to transcribe ` +
      `(${options.model}, ${concurrency} at a time, ${keyPool.freeKeys.length} free key(s)${paidKeyNote})`,
  );

  const context: OcrContext = { keyPool, model: options.model, imageDir: options.imageDir, pagesDir };
  const failedImageNames = await transcribePages(context, pendingImageNames, concurrency);

  const joinedText = joinPages(await readPageTexts(pagesDir, imageNames));
  const outputPath = path.join(options.outDir, `${path.basename(options.imageDir)}.txt`);
  await writeFile(outputPath, `${joinedText}\n`);
  console.log(`Wrote ${joinedText.length} chars to ${outputPath}`);

  if (failedImageNames.length === 0) return;
  throw new Error(`${failedImageNames.length} page(s) failed and are missing from the text: ${failedImageNames.join(', ')}. Rerun to retry them.`);
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exit(1);
});
