#!/usr/bin/env npx tsx
/**
 * Unified EPUB to Book Processing Script
 *
 * Complete pipeline for converting EPUB files to fully processed books:
 * 1. Extract text + images from EPUB
 * 2. Extract ruby registry from EPUB
 * 3. Upload illustrations + image metadata to the BookImages bucket (BOOK_IMAGES_BUCKET)
 * 4. Batch rephrase with Gemini AI
 * 5. Add furigana to rephrased text
 * 6. Sync to database after each chunk
 *
 * Usage:
 *   npx tsx scripts/epub-to-book.ts "path/to/book.epub" [options]
 *
 * Options:
 *   --output-dir <dir>   Output directory in public/ (default: bookv2-furigana)
 *   --chunk-size <n>     Target characters per chunk (default: 5000)
 *   --delay <n>          Seconds between chunks (default: 600 = 10min)
 *   --model <name>       Gemini model (default: gemini-2.5-flash)
 *   --skip-rephrase      Only extract, don't rephrase
 *   --skip-images        Don't extract images
 *   --filter <level>     Kanji filter: all, n3 (default: all)
 *   --reset              Start fresh, ignore existing progress
 *   --dry-run            Show plan without processing
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

// Load environment variables
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// ============================================================================
// Constants
// ============================================================================

// Use 'python' on Windows, 'python3' elsewhere
// On Windows, use full path if regular python command fails
const PYTHON_CMD = process.platform === 'win32'
  ? 'C:\\Users\\azimm\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
  : 'python3';

const AI_MODELS = {
  GEMINI_3_FLASH_PREVIEW: 'gemini-3-flash-preview',
  GEMINI_2_5_FLASH: 'gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE: 'gemini-2.5-flash-lite',
  GEMINI_FLASH: 'gemini-2.0-flash-exp',
  GEMINI_PRO: 'gemini-1.5-pro-latest',
} as const;

// Model fallback order: try gemini-3-flash-preview first, then 2.5-flash, then 2.5-flash-lite
const MODEL_FALLBACK_ORDER = [
  AI_MODELS.GEMINI_3_FLASH_PREVIEW,
  AI_MODELS.GEMINI_2_5_FLASH,
  AI_MODELS.GEMINI_2_5_FLASH_LITE,
];

const VN_RETRY_CONFIG = {
  MAX_ATTEMPTS: 4,
  INITIAL_ATTEMPT: 1,
} as const;

const ai_instructions = `
以下の文章について、日本語学習者が意味を掴みやすくするために、元の一行ごとに要約してください。回答は必ず下記の構成に従ってください。

<（原文）
>>元の文のメッセージを要約してください。

一行ずつ、このフォーマットを繰り返してください。

例：
< かつて１０００年の都と謳われた古都のはずれに、世界はどこまでもシンプルであり、人は今日からでも幸せになれる、と説く哲学者が住んでいた。
>> 古都のはずれに、「世界はシンプルで人は幸せになれる」と説く哲学者が住んでいた。

< 納得のいかない青年は、哲学者のもとを訪ね、その真意を問いただそうとしていた。
>> その教えに納得できない青年が、哲学者の本当の考えを聞きに行った。

< 悩み多き彼の目には、世界は矛盾に満ちた混沌としか映らず、ましてや幸福などありえなかった。
>> 悩みの多い青年には、世界は複雑で、幸せになれるとは思えなかった。

---
それでは、以下の文章でお願いします：
`;

// ============================================================================
// Types
// ============================================================================

interface CLIOptions {
  epubPath: string;
  outputDir: string;
  chunkSize: number;
  delaySeconds: number;
  model: string;
  skipRephrase: boolean;
  skipExtract: boolean;
  skipImages: boolean;
  filter: 'all' | 'n3';
  reset: boolean;
  dryRun: boolean;
  apiUrl: string;
}

interface ProgressFile {
  version: number;
  source: {
    fileName: string;
    directory: string;
    totalCharacters: number;
    hash: string;
  };
  chunks: {
    total: number;
    completed: number;
    items: ChunkProgress[];
  };
  settings: {
    chunkSize: number;
    delaySeconds: number;
    model: string;
  };
  startedAt: string;
  lastUpdatedAt: string;
}

interface ChunkProgress {
  index: number;
  startChar: number;
  endChar: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  completedAt?: string;
  error?: string;
}

interface ParsedItem {
  head: string;
  subItems: string[];
}

// ============================================================================
// Utility Functions
// ============================================================================

function stripRubyTags(text: string): string {
  return text.replace(/<ruby>(?:<rb>)?(.+?)(?:<\/rb>)?<rt>.+?<\/rt><\/ruby>/g, '$1');
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function parseMarkdown(text: string): ParsedItem[] {
  const hasHeadingPrefix = /^[<＜](?!ruby>|rt>)/m.test(text);
  const hasSubItemSeparator = text.includes('>>');

  if (!hasHeadingPrefix && !hasSubItemSeparator) {
    return [];
  }

  const lines = text.split('\n');
  const items: ParsedItem[] = [];
  let currentItem: ParsedItem | null = null;
  let collectingHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (collectingHeader && currentItem) {
        currentItem.head += '\n';
      }
      continue;
    }

    if (/^[<＜]/.test(trimmed) && !/^<ruby>/.test(trimmed)) {
      currentItem = {
        head: trimmed.replace(/^[<＜]\s*/, ''),
        subItems: [],
      };
      items.push(currentItem);
      collectingHeader = true;
    } else if (trimmed.startsWith('>>')) {
      collectingHeader = false;
      if (currentItem) {
        currentItem.subItems.push(trimmed.replace(/^>>\s*/, ''));
      }
    } else if (collectingHeader && currentItem) {
      currentItem.head += '\n' + trimmed;
    }
  }

  return items;
}

function validateResponse(response: string): boolean {
  const items = parseMarkdown(response);
  if (items.length === 0) return false;
  return items.every(item =>
    item.head && item.head.length > 0 && item.subItems.length >= 1
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// ============================================================================
// EPUB Extraction
// ============================================================================

function extractEpub(epubPath: string, outputDir: string, filter: string, skipImages: boolean): string | null {
  console.log('\n=== Step 1: Extracting EPUB ===\n');

  const filterArg = filter === 'n3' ? '--filter n3' : '';
  const outputArg = `--output "${path.join(process.cwd(), 'public', outputDir)}"`;

  const cmd = `${PYTHON_CMD} scripts/core/epub-to-text-furigana.py "${epubPath}" ${filterArg} ${outputArg}`;

  console.log(`Running: ${cmd}\n`);

  try {
    const result = spawnSync(PYTHON_CMD, [
      'scripts/core/epub-to-text-furigana.py',
      epubPath,
      ...(filter === 'n3' ? ['--filter', 'n3'] : []),
      '--output', path.join(process.cwd(), 'public', outputDir),
    ], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      console.error('EPUB extraction failed');
      return null;
    }

    // Find the created book directory
    const baseDir = path.join(process.cwd(), 'public', outputDir);
    const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    // Find most recently created directory (the one we just made)
    let newestDir = '';
    let newestTime = 0;

    for (const dir of dirs) {
      const dirPath = path.join(baseDir, dir);
      const stat = fs.statSync(dirPath);
      if (stat.mtimeMs > newestTime) {
        newestTime = stat.mtimeMs;
        newestDir = dir;
      }
    }

    if (newestDir) {
      console.log(`\nExtracted to: ${newestDir}`);
      return newestDir;
    }

    return null;
  } catch (error) {
    console.error('Error running epub extraction:', error);
    return null;
  }
}

// ============================================================================
// Ruby Registry Extraction
// ============================================================================

function extractRubyRegistry(epubPath: string, bookDir: string): boolean {
  console.log('\n=== Step 2: Extracting Ruby Registry ===\n');

  // Create temp directory and copy EPUB there for extract-ruby-smart.py
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const epubName = path.basename(epubPath);
  const tempEpubPath = path.join(tempDir, epubName);

  // Copy EPUB to temp
  fs.copyFileSync(epubPath, tempEpubPath);
  console.log(`Copied EPUB to: ${tempEpubPath}`);

  try {
    const result = spawnSync(PYTHON_CMD, [
      'scripts/core/extract-ruby-smart.py',
    ], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'inherit',
    });

    // Clean up temp file
    if (fs.existsSync(tempEpubPath)) {
      fs.unlinkSync(tempEpubPath);
    }

    if (result.status !== 0) {
      console.error('Ruby registry extraction failed');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error extracting ruby registry:', error);
    // Clean up on error
    if (fs.existsSync(tempEpubPath)) {
      fs.unlinkSync(tempEpubPath);
    }
    return false;
  }
}

// ============================================================================
// Illustration Upload
// ============================================================================

// public/<outputDir> is gitignored, so illustrations never reach the deployed app on
// their own; the reader loads them from this bucket through /api/book-assets.
function uploadBookImages(outputDir: string, bookName: string): void {
  console.log('\n=== Step 3: Uploading Illustrations ===\n');

  const bucket = process.env.BOOK_IMAGES_BUCKET;
  if (!bucket) {
    console.warn('BOOK_IMAGES_BUCKET is not set in .env.local; skipping. Illustrations will not show until uploaded.');
    return;
  }

  const bookPrefix = `${outputDir}/${bookName}`;
  const result = spawnSync('aws', [
    's3', 'sync', path.join(process.cwd(), 'public', bookPrefix), `s3://${bucket}/${bookPrefix}/`,
    '--exclude', '*', '--include', 'images/*', '--include', '*.json',
    '--exclude', '*-progress.json', '--exclude', 'ruby-registry.json', '--only-show-errors',
  ], { encoding: 'utf-8', stdio: 'inherit' });

  if (result.status !== 0) {
    console.error('Illustration upload failed; rerun the README "Book Illustrations" sync once fixed.');
    return;
  }
  console.log(`Uploaded illustrations to s3://${bucket}/${bookPrefix}/`);
}

// ============================================================================
// Text Chunking
// ============================================================================

function chunkText(text: string, targetSize: number = 5000): { chunks: string[]; boundaries: { start: number; end: number }[] } {
  const paragraphs = text.split(/\n\s*\n/);

  const chunks: string[] = [];
  const boundaries: { start: number; end: number }[] = [];

  let currentChunk = '';
  let currentChunkStripped = '';
  let chunkStart = 0;
  let currentPos = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    if (!paragraph) continue;

    const paragraphStripped = stripRubyTags(paragraph);
    const separator = currentChunk ? '\n\n' : '';

    if (currentChunkStripped.length + paragraphStripped.length + separator.length > targetSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        boundaries.push({ start: chunkStart, end: currentPos });
        chunkStart = currentPos;
        currentChunk = '';
        currentChunkStripped = '';
      }

      if (paragraphStripped.length > targetSize) {
        const sentences = paragraph.split(/(?<=[。！？])/);
        let sentenceChunk = '';
        let sentenceChunkStripped = '';

        for (const sentence of sentences) {
          const sentenceStripped = stripRubyTags(sentence);

          if (sentenceChunkStripped.length + sentenceStripped.length > targetSize && sentenceChunk) {
            chunks.push(sentenceChunk);
            boundaries.push({ start: chunkStart, end: currentPos });
            chunkStart = currentPos;
            sentenceChunk = sentence;
            sentenceChunkStripped = sentenceStripped;
          } else {
            sentenceChunk += sentence;
            sentenceChunkStripped += sentenceStripped;
          }
        }

        if (sentenceChunk) {
          currentChunk = sentenceChunk;
          currentChunkStripped = sentenceChunkStripped;
        }
      } else {
        currentChunk = paragraph;
        currentChunkStripped = paragraphStripped;
      }
    } else {
      currentChunk += separator + paragraph;
      currentChunkStripped += separator + paragraphStripped;
    }

    currentPos += paragraph.length + 2;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
    boundaries.push({ start: chunkStart, end: currentPos });
  }

  return { chunks, boundaries };
}

// ============================================================================
// Progress Management
// ============================================================================

function getProgressPath(sourceDir: string, bookName: string): string {
  return path.join(sourceDir, `${bookName}-rephrase-progress.json`);
}

function loadProgress(progressPath: string): ProgressFile | null {
  if (!fs.existsSync(progressPath)) return null;
  try {
    const content = fs.readFileSync(progressPath, 'utf-8');
    return JSON.parse(content) as ProgressFile;
  } catch {
    return null;
  }
}

function saveProgress(progressPath: string, progress: ProgressFile): void {
  progress.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
}

function createProgress(
  bookName: string,
  directory: string,
  sourceText: string,
  chunks: string[],
  boundaries: { start: number; end: number }[],
  settings: { chunkSize: number; delaySeconds: number; model: string }
): ProgressFile {
  return {
    version: 1,
    source: {
      fileName: bookName,
      directory: directory,
      totalCharacters: stripRubyTags(sourceText).length,
      hash: simpleHash(sourceText),
    },
    chunks: {
      total: chunks.length,
      completed: 0,
      items: chunks.map((_, index) => ({
        index,
        startChar: boundaries[index].start,
        endChar: boundaries[index].end,
        status: 'pending' as const,
        attempts: 0,
      })),
    },
    settings: {
      chunkSize: settings.chunkSize,
      delaySeconds: settings.delaySeconds,
      model: settings.model,
    },
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// AI Processing
// ============================================================================

// Multiple API key support for faster processing
let aiClients: GoogleGenAI[] = [];
let currentClientIndex = 0;

function initializeAIClients(): void {
  if (aiClients.length > 0) return;

  // Collect all GEMINI_API_KEY* environment variables
  const keys: string[] = [];

  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY2) keys.push(process.env.GEMINI_API_KEY2);
  if (process.env.GEMINI_API_KEY3) keys.push(process.env.GEMINI_API_KEY3);
  if (process.env.GEMINI_API_KEY4) keys.push(process.env.GEMINI_API_KEY4);
  if (process.env.GEMINI_API_KEY5) keys.push(process.env.GEMINI_API_KEY5);

  if (keys.length === 0) {
    throw new Error('No GEMINI_API_KEY environment variables set');
  }

  console.log(`Initialized ${keys.length} API key(s) for rotation`);
  aiClients = keys.map(apiKey => new GoogleGenAI({ apiKey }));
}

function getAIClient(): GoogleGenAI {
  initializeAIClients();
  return aiClients[currentClientIndex];
}

function rotateAIClient(): void {
  initializeAIClients();
  currentClientIndex = (currentClientIndex + 1) % aiClients.length;
}

function getApiKeyCount(): number {
  initializeAIClients();
  return aiClients.length;
}

async function processChunk(
  chunk: string,
  model: string,
  maxAttempts: number = VN_RETRY_CONFIG.MAX_ATTEMPTS
): Promise<{ success: boolean; response: string; attempts: number; usedModel?: string }> {
  const ai = getAIClient();
  const cleanChunk = stripRubyTags(chunk);

  // Build model fallback list: start with requested model, then add fallbacks
  const modelsToTry = [model];
  for (const fallbackModel of MODEL_FALLBACK_ORDER) {
    if (!modelsToTry.includes(fallbackModel)) {
      modelsToTry.push(fallbackModel);
    }
  }

  for (const currentModel of modelsToTry) {
    let currentInstruction = ai_instructions;
    let attempt = 0;

    console.log(`    Trying model: ${currentModel}`);

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`    Attempt ${attempt}/${maxAttempts}...`);

      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: currentInstruction + cleanChunk,
        });

        const responseText = response.text || '';

        if (validateResponse(responseText)) {
          if (currentModel !== model) {
            console.log(`    Success with fallback model: ${currentModel}`);
          }
          return { success: true, response: responseText, attempts: attempt, usedModel: currentModel };
        }

        console.log('    Invalid format, retrying with correction prompt...');
        console.log('    Response preview:', responseText.slice(0, 200).replace(/\n/g, '\\n'));
        currentInstruction =
          '回答のフォーマットが正しくありません。もう一度やり直してください。必ず下記の構成に従ってください。\n' +
          ai_instructions;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`    API error on attempt ${attempt}:`, errorMessage);

        // Check if it's a model-specific error (not found, quota, etc.)
        if (errorMessage.includes('not found') || errorMessage.includes('404') ||
            errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
          console.log(`    Model ${currentModel} unavailable, trying next fallback...`);
          break; // Try next model
        }

        if (attempt < maxAttempts) {
          const waitTime = Math.min(30, attempt * 10);
          console.log(`    Waiting ${waitTime}s before retry...`);
          await sleep(waitTime * 1000);
        }
      }
    }
  }

  return { success: false, response: '', attempts: maxAttempts * modelsToTry.length };
}

// ============================================================================
// Database Sync
// ============================================================================

async function syncToDatabase(
  apiUrl: string,
  fileName: string,
  directory: string
): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/api/text-entries`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, directory }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`    Database sync failed: ${response.status} - ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`    Database sync error:`, error);
    return false;
  }
}

// ============================================================================
// Furigana Addition
// ============================================================================

function addFuriganaToChunk(chunkText: string, outputDir: string): string {
  const tempInput = path.join(outputDir, 'temp-chunk.txt');
  const tempOutput = path.join(outputDir, 'temp-chunk-furigana.txt');

  fs.writeFileSync(tempInput, chunkText, 'utf-8');

  try {
    execSync(`${PYTHON_CMD} scripts/core/add-furigana-to-text.py "${tempInput}" -o "${tempOutput}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const result = fs.readFileSync(tempOutput, 'utf-8');

    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);

    return result;
  } catch (error) {
    console.error(`    Furigana addition failed:`, error);
    fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    return chunkText;
  }
}

// ============================================================================
// Batch Rephrase Processing
// ============================================================================

async function batchRephrase(
  bookName: string,
  sourceDir: string,
  options: CLIOptions
): Promise<boolean> {
  console.log('\n=== Step 4: Batch Rephrasing ===\n');

  const sourcePath = path.join(sourceDir, `${bookName}.txt`);
  const outputPath = path.join(sourceDir, `${bookName}-rephrase.txt`);
  const outputPathFurigana = path.join(sourceDir, `${bookName}-rephrase-furigana.txt`);
  const progressPath = getProgressPath(sourceDir, bookName);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    return false;
  }

  const sourceText = fs.readFileSync(sourcePath, 'utf-8');
  const strippedLength = stripRubyTags(sourceText).length;
  console.log(`Source: ${sourcePath}`);
  console.log(`Total characters: ${strippedLength.toLocaleString()} (excluding furigana)`);

  let progress = options.reset ? null : loadProgress(progressPath);
  let chunks: string[];

  if (progress) {
    const currentHash = simpleHash(sourceText);
    if (progress.source.hash !== currentHash) {
      console.log('\nSource file has changed since last run.');
      console.log('Use --reset to start fresh.');
      return false;
    }

    console.log(`\nResuming from progress: ${progress.chunks.completed}/${progress.chunks.total} chunks done`);
    const result = chunkText(sourceText, progress.settings.chunkSize);
    chunks = result.chunks;
  } else {
    const result = chunkText(sourceText, options.chunkSize);
    chunks = result.chunks;

    const keyCount = getApiKeyCount();
    const effectiveDelay = Math.ceil(options.delaySeconds / keyCount);

    console.log(`\nChunks: ${chunks.length} (target size: ${options.chunkSize} chars)`);
    console.log(`API Keys: ${keyCount} (rotating for faster processing)`);
    console.log(`Delay: ${effectiveDelay}s (${formatDuration(effectiveDelay)}) between chunks (base: ${options.delaySeconds}s / ${keyCount} keys)`);
    console.log(`Model: ${options.model}`);
    console.log(`Database sync: ${options.apiUrl}`);
    console.log(`Furigana: enabled (adding after each chunk)`);

    const estimatedTime = chunks.length * effectiveDelay;
    console.log(`Estimated total time: ${formatDuration(estimatedTime)}`);

    progress = createProgress(
      bookName,
      `${options.outputDir}/${bookName}`,
      sourceText,
      chunks,
      result.boundaries,
      { chunkSize: options.chunkSize, delaySeconds: options.delaySeconds, model: options.model }
    );
  }

  if (options.dryRun) {
    console.log('\n=== Dry Run - Chunk Preview ===');
    chunks.forEach((chunk, i) => {
      const stripped = stripRubyTags(chunk);
      const preview = stripped.slice(0, 50).replace(/\n/g, ' ');
      console.log(`\nChunk ${i + 1}/${chunks.length} (${stripped.length} chars):`);
      console.log(`  ${preview}...`);
    });
    return true;
  }

  // Setup graceful shutdown
  let shouldStop = false;
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT. Saving progress and exiting...');
    shouldStop = true;
  });

  console.log('\n=== Starting Processing ===\n');

  const startTime = Date.now();
  let processedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (shouldStop) break;

    const chunkProgress = progress.chunks.items[i];

    if (chunkProgress.status === 'completed') {
      continue;
    }

    const chunk = chunks[i];
    const chunkStripped = stripRubyTags(chunk);

    console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunkStripped.length} chars)...`);

    chunkProgress.status = 'processing';
    saveProgress(progressPath, progress);

    const result = await processChunk(chunk, progress.settings.model);
    chunkProgress.attempts = result.attempts;

    if (result.success) {
      chunkProgress.status = 'completed';
      chunkProgress.completedAt = new Date().toISOString();
      progress.chunks.completed++;

      // Save raw rephrase output
      const separator = fs.existsSync(outputPath) ? '\n\n' : '';
      fs.appendFileSync(outputPath, separator + result.response, 'utf-8');

      // Add furigana
      console.log(`  Adding furigana...`);
      const finalText = addFuriganaToChunk(result.response, sourceDir);
      const furiganaSeparator = fs.existsSync(outputPathFurigana) ? '\n\n' : '';
      fs.appendFileSync(outputPathFurigana, furiganaSeparator + finalText, 'utf-8');
      console.log(`  Furigana added!`);

      // Sync to database
      const outputDirectory = `${options.outputDir}/${bookName}`;
      console.log(`  Syncing to database...`);
      const synced = await syncToDatabase(options.apiUrl, `${bookName}-rephrase-furigana`, outputDirectory);
      if (synced) {
        console.log(`  Database synced! Users can now read the updated content.`);
      } else {
        console.log(`  Warning: Database sync failed. File saved locally.`);
      }

      processedCount++;

      const elapsed = (Date.now() - startTime) / 1000;
      const avgTime = elapsed / processedCount;
      const remaining = chunks.length - progress.chunks.completed;
      const eta = remaining * Math.max(avgTime, progress.settings.delaySeconds);

      console.log(`  Done! (${progress.chunks.completed}/${chunks.length})`);
      console.log(`  ETA for remaining: ${formatDuration(eta)}`);
    } else {
      // Fallback: include original text without rephrasing so no content is skipped
      chunkProgress.status = 'completed';
      chunkProgress.completedAt = new Date().toISOString();
      chunkProgress.error = 'Used original text (rephrase failed)';
      progress.chunks.completed++;

      console.log(`  Failed after ${result.attempts} attempts, using original text as fallback...`);

      // Convert original text to the expected format (each line as < original >> original)
      const cleanChunk = stripRubyTags(chunk);
      const lines = cleanChunk.split('\n').filter(l => l.trim().length > 0);
      const fallbackResponse = lines.map(line => `< ${line}\n>> ${line}`).join('\n\n');

      const separator = fs.existsSync(outputPath) ? '\n\n' : '';
      fs.appendFileSync(outputPath, separator + fallbackResponse, 'utf-8');

      console.log(`  Adding furigana to fallback...`);
      const finalText = addFuriganaToChunk(fallbackResponse, sourceDir);
      const furiganaSeparator = fs.existsSync(outputPathFurigana) ? '\n\n' : '';
      fs.appendFileSync(outputPathFurigana, furiganaSeparator + finalText, 'utf-8');

      const outputDirectory = `${options.outputDir}/${bookName}`;
      const synced = await syncToDatabase(options.apiUrl, `${bookName}-rephrase-furigana`, outputDirectory);
      if (synced) {
        console.log(`  Database synced with fallback content.`);
      }

      processedCount++;
    }

    saveProgress(progressPath, progress);

    // Rotate to next API key for next chunk
    rotateAIClient();

    // Wait before next chunk (delay divided by number of API keys)
    if (i < chunks.length - 1 && !shouldStop) {
      const pendingCount = progress.chunks.items.filter(c => c.status === 'pending').length;
      if (pendingCount > 0) {
        const keyCount = getApiKeyCount();
        const effectiveDelay = Math.ceil(progress.settings.delaySeconds / keyCount);
        console.log(`\n  Rotating to API key ${(currentClientIndex % keyCount) + 1}/${keyCount}`);
        console.log(`  Waiting ${formatDuration(effectiveDelay)} before next chunk...`);
        console.log(`  (Press Ctrl+C to stop and save progress)\n`);
        await sleep(effectiveDelay * 1000);
      }
    }
  }

  // Final summary
  console.log('\n=== Rephrasing Complete ===');
  console.log(`Completed: ${progress.chunks.completed}/${progress.chunks.total} chunks`);

  const failed = progress.chunks.items.filter(c => c.status === 'failed').length;
  if (failed > 0) {
    console.log(`Failed: ${failed} chunks`);
  }

  console.log(`Output: ${outputPathFurigana}`);
  console.log(`Progress: ${progressPath}`);

  return progress.chunks.completed === progress.chunks.total;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Unified EPUB to Book Processing Script

Usage:
  npx tsx scripts/epub-to-book.ts <epub-file> [options]

Options:
  --output-dir <dir>   Output directory in public/ (default: bookv2-furigana)
  --chunk-size <n>     Target characters per chunk (default: 5000)
  --delay <n>          Seconds between chunks (default: 600 = 10min)
  --model <name>       Gemini model (default: gemini-2.5-flash)
  --skip-rephrase      Only extract, don't rephrase
  --skip-images        Don't extract images
  --filter <level>     Kanji filter: all, n3 (default: all)
  --reset              Start fresh, ignore existing progress
  --dry-run            Show plan without processing

Example:
  npx tsx scripts/epub-to-book.ts "my-book.epub"
  npx tsx scripts/epub-to-book.ts "my-book.epub" --delay 300 --filter n3
  npx tsx scripts/epub-to-book.ts "my-book.epub" --skip-rephrase
`);
    process.exit(0);
  }

  const options: CLIOptions = {
    epubPath: args[0],
    outputDir: 'bookv2-furigana',
    chunkSize: 5000,
    delaySeconds: 120, // Base delay (divided by number of API keys)
    model: AI_MODELS.GEMINI_3_FLASH_PREVIEW,
    skipRephrase: false,
    skipExtract: false,
    skipImages: false,
    filter: 'all',
    reset: false,
    dryRun: false,
    apiUrl: 'http://localhost:3333',
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--chunk-size':
        options.chunkSize = parseInt(args[++i], 10);
        break;
      case '--delay':
        options.delaySeconds = parseInt(args[++i], 10);
        break;
      case '--model':
        options.model = args[++i];
        break;
      case '--skip-rephrase':
        options.skipRephrase = true;
        break;
      case '--skip-extract':
        options.skipExtract = true;
        break;
      case '--skip-images':
        options.skipImages = true;
        break;
      case '--filter':
        options.filter = args[++i] as 'all' | 'n3';
        break;
      case '--reset':
        options.reset = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--api-url':
        options.apiUrl = args[++i];
        break;
    }
  }

  // Validate EPUB file
  if (!fs.existsSync(options.epubPath)) {
    console.error(`Error: EPUB file not found: ${options.epubPath}`);
    process.exit(1);
  }

  console.log(`
============================================================
  EPUB to Book Processing Pipeline
============================================================
  EPUB: ${options.epubPath}
  Output: public/${options.outputDir}/
  Model: ${options.model}
  Filter: ${options.filter}
  Skip Rephrase: ${options.skipRephrase}
============================================================
`);

  // Step 1: Extract EPUB
  let bookName: string | null;
  if (options.skipExtract) {
    // Derive book name from epub filename
    bookName = path.basename(options.epubPath, path.extname(options.epubPath));
    console.log(`\n=== Skipping Extraction (--skip-extract) ===`);
    console.log(`Using existing book: ${bookName}\n`);
  } else {
    bookName = extractEpub(options.epubPath, options.outputDir, options.filter, options.skipImages);
    if (!bookName) {
      console.error('Failed to extract EPUB');
      process.exit(1);
    }
  }

  const sourceDir = path.join(process.cwd(), 'public', options.outputDir, bookName);

  // Step 2: Extract Ruby Registry
  if (!options.skipExtract) {
    extractRubyRegistry(options.epubPath, bookName);
  }

  // Step 3: Upload illustrations before rephrasing, so chunks synced during step 4
  // are readable with their images straight away
  if (!options.dryRun) {
    uploadBookImages(options.outputDir, bookName);
  }

  // Step 4: Batch Rephrase (unless skipped)
  if (!options.skipRephrase) {
    const success = await batchRephrase(bookName, sourceDir, options);
    if (!success && !options.dryRun) {
      console.log('\nRephrasing incomplete. Run again to resume.');
    }
  } else {
    console.log('\n=== Skipping Rephrase (--skip-rephrase) ===');
    console.log(`Book extracted to: ${sourceDir}`);
  }

  console.log(`
============================================================
  Processing Complete!
============================================================
  Book: ${bookName}
  Location: public/${options.outputDir}/${bookName}/

  Files created:
    - ${bookName}.txt (extracted text)
    - ${bookName}.json (metadata)
    - ruby-registry.json (vocabulary)
    ${!options.skipRephrase ? `- ${bookName}-rephrase.txt (raw rephrase)
    - ${bookName}-rephrase-furigana.txt (final with furigana)` : ''}
============================================================
`);
}

main().catch(console.error);
