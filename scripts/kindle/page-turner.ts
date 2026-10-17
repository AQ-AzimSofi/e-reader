#!/usr/bin/env npx tsx
/**
 * Turn Kindle Cloud Reader pages on a fixed interval in an already signed-in browser.
 *
 * Attaches over CDP to a running Chromium (started with --remote-debugging-port),
 * finds the open read.amazon.* book tab, and presses the arrow key that means
 * "next page" for that book. Japanese vertical books advance with ArrowLeft and
 * horizontal ones with ArrowRight, so the direction is probed once at startup.
 *
 * Usage: npx tsx scripts/kindle/page-turner.ts [--interval 30] [--cdp http://127.0.0.1:9222] [--direction rtl|ltr] [--screenshot-dir <dir>]
 * See scripts/kindle/README.md for launching Chrome and tunnelling to a remote one.
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const NEXT_KEY_BY_DIRECTION = { rtl: 'ArrowLeft', ltr: 'ArrowRight' } as const;
type Direction = keyof typeof NEXT_KEY_BY_DIRECTION;

// The parts most likely to break when Amazon ships a reader redesign.
const READER_SELECTORS = { footer: 'ion-footer', pageImages: '#kr-renderer img' };
const BOOK_URL_PATTERN = /^https:\/\/read\.amazon\.[a-z.]+\/.*[?&]asin=/;
// Footer reads "位置12/2218 ● 1%" in Japanese and "Location 12 of 2218" in English.
const POSITION_PATTERN = /(\d+)\s*(?:\/|of)\s*(\d+)/;

const PAGE_CHANGE_TIMEOUT_MS = 10_000;
const PAGE_CHANGE_POLL_MS = 250;
const IMAGE_LOAD_TIMEOUT_MS = 10_000;
const IMAGE_LOAD_POLL_MS = 100;

interface CliOptions {
  cdpUrl: string;
  intervalMs: number;
  direction?: Direction;
  screenshotDir?: string;
}

interface Position {
  current: number;
  total: number;
}

interface ReaderSnapshot {
  position?: Position;
  imageSources: string;
}

function isDirection(value: string): value is Direction {
  return value in NEXT_KEY_BY_DIRECTION;
}

function parseCliOptions(): CliOptions {
  const { values } = parseArgs({
    options: {
      cdp: { type: 'string', default: 'http://127.0.0.1:9222' },
      interval: { type: 'string', default: '30' },
      direction: { type: 'string' },
      'screenshot-dir': { type: 'string' },
    },
  });
  const intervalSecs = Number(values.interval);
  const isValidInterval = Number.isFinite(intervalSecs) && intervalSecs > 0;
  if (!isValidInterval) throw new Error(`--interval must be a positive number of seconds, got "${values.interval}"`);
  if (values.direction !== undefined && !isDirection(values.direction)) {
    throw new Error(`--direction must be rtl or ltr, got "${values.direction}"`);
  }
  return {
    cdpUrl: values.cdp,
    intervalMs: intervalSecs * 1000,
    direction: values.direction,
    screenshotDir: values['screenshot-dir'],
  };
}

function findBookPage(browser: Browser): Page {
  const openPages = browser.contexts().flatMap((context) => context.pages());
  const bookPage = openPages.find((page) => BOOK_URL_PATTERN.test(page.url()));
  if (!bookPage) throw new Error('No Kindle book tab found. Open a book in read.amazon.* first.');
  return bookPage;
}

function parsePosition(footerText: string): Position | undefined {
  const match = POSITION_PATTERN.exec(footerText);
  if (!match) return undefined;
  return { current: Number(match[1]), total: Number(match[2]) };
}

// Runs in the browser, so it must stay self-contained: no outer references or named inner helpers.
function readReaderDom(selectors: typeof READER_SELECTORS): { footerText: string; imageSources: string } {
  const footerText = document.querySelector(selectors.footer)?.textContent ?? '';
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(selectors.pageImages));
  return { footerText, imageSources: images.map((image) => image.src).join('|') };
}

// Runs in the browser, under the same constraint as readReaderDom.
function arePageImagesLoaded(pageImagesSelector: string): boolean {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(pageImagesSelector));
  return images.every((image) => image.complete && image.naturalWidth > 0);
}

async function readSnapshot(page: Page): Promise<ReaderSnapshot> {
  const { footerText, imageSources } = await page.evaluate(readReaderDom, READER_SELECTORS);
  return { position: parsePosition(footerText), imageSources };
}

function hasTurned(before: ReaderSnapshot, current: ReaderSnapshot): boolean {
  // The reader blanks while rendering; a frame missing what the previous page showed is not a new page yet.
  const hasLostPosition = before.position !== undefined && current.position === undefined;
  const hasLostImages = before.imageSources !== '' && current.imageSources === '';
  if (hasLostPosition || hasLostImages) return false;
  return current.imageSources !== before.imageSources || current.position?.current !== before.position?.current;
}

async function waitForPageChange(page: Page, before: ReaderSnapshot): Promise<ReaderSnapshot | undefined> {
  const deadline = Date.now() + PAGE_CHANGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(PAGE_CHANGE_POLL_MS);
    const current = await readSnapshot(page);
    if (hasTurned(before, current)) return current;
  }
  return undefined;
}

async function pressAndWaitForChange(page: Page, key: string, before: ReaderSnapshot): Promise<ReaderSnapshot | undefined> {
  // With the location slider focused, arrow keys scrub it instead of turning the page.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
  return waitForPageChange(page, before);
}

/** Probes with ArrowLeft and always returns to the starting page. */
async function detectDirection(page: Page, start: ReaderSnapshot): Promise<Direction> {
  const afterProbe = await pressAndWaitForChange(page, NEXT_KEY_BY_DIRECTION.rtl, start);
  if (!afterProbe) return 'ltr';
  await pressAndWaitForChange(page, NEXT_KEY_BY_DIRECTION.ltr, afterProbe);
  // An unchanged location still counts as forward: the cover and the page after it share location 1.
  const movedBackward = (afterProbe.position?.current ?? 0) < (start.position?.current ?? 0);
  return movedBackward ? 'ltr' : 'rtl';
}

function formatPosition(snapshot: ReaderSnapshot): string {
  const time = new Date().toLocaleTimeString();
  if (!snapshot.position) return `[${time}] turned (position unknown)`;
  const { current, total } = snapshot.position;
  return `[${time}] ${current}/${total} (${Math.round((current / total) * 100)}%)`;
}

async function saveScreenshot(page: Page, screenshotDir: string): Promise<void> {
  // A changed image src only means the new page started loading; wait so the capture is not blank.
  // Interval polling instead of the requestAnimationFrame default, which stalls when the tab is hidden.
  await page.waitForFunction(arePageImagesLoaded, READER_SELECTORS.pageImages, {
    timeout: IMAGE_LOAD_TIMEOUT_MS,
    polling: IMAGE_LOAD_POLL_MS,
  });
  const pageNumber = (await readdir(screenshotDir)).length + 1;
  const fileName = `${String(pageNumber).padStart(4, '0')}.png`;
  // Numbering continues from the files already there, so a rerun appends; 'wx' fails rather than overwrite.
  await writeFile(path.join(screenshotDir, fileName), await page.screenshot(), { flag: 'wx' });
}

async function turnPagesUntilStopped(
  page: Page,
  nextKey: string,
  options: { intervalMs: number; signal: AbortSignal; screenshotDir?: string },
): Promise<void> {
  while (!options.signal.aborted) {
    const isIntervalElapsed = await sleep(options.intervalMs, undefined, { signal: options.signal }).then(
      () => true,
      () => false,
    );
    if (!isIntervalElapsed) return;
    const before = await readSnapshot(page);
    const after = await pressAndWaitForChange(page, nextKey, before);
    if (!after) {
      console.log('Page did not change: end of book, or the reader stopped responding.');
      return;
    }
    console.log(formatPosition(after));
    if (options.screenshotDir) await saveScreenshot(page, options.screenshotDir);
  }
}

async function runPageTurner(page: Page, options: CliOptions): Promise<void> {
  const start = await readSnapshot(page);
  if (!start.position && !start.imageSources) {
    throw new Error(`Reader not detected on ${page.url()} (looked for ${Object.values(READER_SELECTORS).join(', ')}).`);
  }
  const direction = options.direction ?? (await detectDirection(page, start));
  const nextKey = NEXT_KEY_BY_DIRECTION[direction];
  console.log(`${formatPosition(start)} - ${direction}, next page = ${nextKey}, every ${options.intervalMs / 1000}s. Ctrl+C to stop.`);

  if (options.screenshotDir) {
    await mkdir(options.screenshotDir, { recursive: true });
    console.log(`Saving a screenshot of each page to ${path.resolve(options.screenshotDir)}`);
    // The direction probe has already returned to the start page, so this captures the page the run begins on.
    await saveScreenshot(page, options.screenshotDir);
  }

  const stopController = new AbortController();
  process.once('SIGINT', () => stopController.abort());
  await turnPagesUntilStopped(page, nextKey, {
    intervalMs: options.intervalMs,
    signal: stopController.signal,
    screenshotDir: options.screenshotDir,
  });
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  const browser = await chromium.connectOverCDP(options.cdpUrl);
  try {
    const bookPage = findBookPage(browser);
    await bookPage.bringToFront();
    await runPageTurner(bookPage, options);
  } finally {
    // For a CDP connection this only disconnects; the user's browser and tabs stay open.
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
