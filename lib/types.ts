/**
 * よみサポアプリケーションのコア型定義
 */

// AI生成のマークダウンから解析されたアイテム構造
export interface ParsedItem {
  head: string;       // 元の日本語テキスト（プレフィックスなし）
  subItems: string[]; // 言い換えバージョンの配列
}

// オーディオブックの再生単位（本全体を通した連番つき）
export interface PlayableUnit {
  globalIndex: number;
  main: string;
  sub: string | null;
}

// オーディオブックで読み上げる対象
export type AudioBookContentMode = 'main' | 'sub' | 'both';

// 朗読音源の再生区間（秒）
export interface NarrationCue {
  start: number;
  end: number;
}

// 朗読音源のマニフェスト。cues の添字は PlayableUnit.globalIndex と一致し、
// 音源が対応していないユニットは null（TTSにフォールバックする）
//
// unitCount は生成時の本文のユニット数。読み込み側は「本文がこれより長い」場合だけ
// 弾く（段落が増えた ＝ 以降の添字が全部ずれる）。短い場合は先頭からの一部とみなして
// 受け入れる（ゲストプレビューがこの形）。同じ長さの編集と段落削除は検出できない。
export interface NarrationManifest {
  audioUrl: string;
  unitCount: number;
  cues: (NarrationCue | null)[];
}

// 辞書の単語構造（漢字[読み・意味]）
export interface DictionaryWord {
  kanji: string;
  reading: string;
  meaning: string;
}

// APIレスポンスタイプ
export interface TextResponse {
  text: string;
}

export interface BookmarkResponse {
  text: string;
}

export interface TextFileListResponse {
  directories: string[];
  filesByDirectory: Record<string, string[]>;
  files: string[]; // Flat array of all files (directory/filename format) for backward compatibility
  bookmarkSync?: {
    cleaned: number;
    added: number;
  };
}

export interface GeminiResponse {
  response: string;
  message: string;
}

export interface ExplanationResponse {
  explanation: string;
  message: string;
}

export interface WriteResponse {
  success?: boolean;
  message: string;
}

// APIリクエストタイプ
export interface BookmarkRequest {
  target: string;   // ファイル名
  content: string;  // ブックマークテキスト
  page?: number;    // 現在のページ番号
}

export interface TextRequest {
  text: string;
}

export interface GeminiRequest {
  text?: string;
  image?: File;
}

export interface ExplanationRequest {
  sentence: string;
  context: string;
  fileName: string;
  contextSize: number;
  mode: import('./constants').ExplanationMode;
}

// コンポーネントのプロップ型
export interface CollapsibleItemProps {
  head: string;
  subItems: string[];
  initialDropdownState?: boolean;
  id?: string;
  onSubmitSuccess: () => void;
}

export interface SidebarProps {
  dropdownAlwaysOpen: boolean;
  setDropdownAlwaysOpen: (value: boolean) => void;
}

// クエリパラメータ型
export interface PageQueryParams {
  directory?: string;
  fileName?: string;
  dropdownAlwaysOpen?: string;
}

// ファイル保存型
export interface BookmarkData {
  [fileName: string]: string;
}

// Book metadata types (from EPUB converter JSON)
export interface BookImage {
  fileName: string;          // e.g., "illustration-001.jpg"
  imagePath: string;         // Full path to image file
  orderIndex: number;        // Order in the book
  originalName: string;      // Original name in EPUB (e.g., "image/k001.jpg")
  altText: string | null;    // Alt text for accessibility
}

export interface ProcessingHistory {
  filterMode: string;        // "all" or "n3"
  hiraganaStyle: string;     // "full" or "long-vowel"
  chaptersCount: number;     // Number of chapters
  fileSize: number;          // File size in KB
  imageCount: number;        // Number of images
}

export interface BookMetadata {
  title: string;
  author: string;
  fileName: string;
  textFilePath: string;
  originalEpubName: string;
  processingHistory: ProcessingHistory;
  images: BookImage[];
}

// Image mapping: original name (without "image/" prefix) → actual filename
export type ImageMap = Record<string, string>;

// 説明キャッシュ型
export interface CachedExplanation {
  sentence: string;
  explanation: string;
  contextSize: number;
  mode: import('./constants').ExplanationMode;
  timestamp: number;
}

export interface ExplanationCache {
  [key: string]: CachedExplanation;
}

// 単語帳機能の型
export interface VocabularyEntry {
  id: string;
  word: string;
  reading: string | null;
  sentence: string;
  fileName: string;
  directory: string;
  paragraphText: string | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface VocabularyListResponse {
  success: boolean;
  entries: VocabularyEntry[];
  count: number;
  message?: string;
}

export interface VocabularyCreateRequest {
  word: string;
  reading?: string;
  sentence: string;
  fileName: string;
  directory: string;
  paragraphText?: string;
  notes?: string;
}

export interface VocabularyUpdateRequest {
  notes?: string;
  word?: string;
  reading?: string;
}

export interface VocabularyResponse {
  success: boolean;
  entry?: VocabularyEntry;
  message: string;
}

// TTS（Text-to-Speech）型
export interface TTSRequest {
  text: string;
  speed?: number;
  voiceGender?: import('./constants').TTSVoiceGender;
}

export interface TTSResponse {
  audioContent: string; // base64エンコードされた音声データ
  message: string;
}

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentIndex: number; // 連続再生時の現在位置
  speed: number;
  voiceGender: import('./constants').TTSVoiceGender;
}

export interface TTSPlaybackPosition {
  fileName: string;
  directory: string;
  itemIndex: number;
  timestamp: number;
}

// Ruby Registry types (for character name lookups)
export interface RubyEntry {
  kanji: string;
  reading: string;
  source: 'epub' | 'user';
  note: string;
}

export interface RubySuggestion {
  kanji: string;
  occurrences: number;
}

export interface RubyRegistry {
  bookTitle: string;
  entries: RubyEntry[];
  suggestions: RubySuggestion[];
}

export interface RubyRegistryResponse {
  success: boolean;
  registry?: RubyRegistry;
  message: string;
}
