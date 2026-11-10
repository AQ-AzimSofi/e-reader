"use client";

import dynamic from "next/dynamic";
import ParagraphItem from "@/app/components/reading/ParagraphItem";
import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "@/app/components/ui/Sidebar";
import ReadingControls from "@/app/components/reading/ReadingControls";
import { COLORS, STORAGE_KEYS, EXPLANATION_CONFIG, READER_CONFIG } from "@/lib/constants";

// Lazy load heavy components
const ExplanationSidebar = dynamic(
  () => import("@/app/components/reading/ExplanationSidebar"),
  { ssr: false }
);
import { stripFurigana } from "@/lib/utils/furiganaParser";
import { useBookMetadata } from "@/app/hooks/useBookMetadata";

// Component that reads search params
function SearchParamsReader({ children }: { children: (params: { directory: string | null; fileName: string | null }) => React.ReactNode }) {
  const searchParams = useSearchParams();
  const directory = searchParams.get("directory");
  const fileName = searchParams.get("fileName");

  return <>{children({ directory, fileName })}</>;
}

function BookReaderContent({ directoryParam, fileNameParam }: { directoryParam: string | null; fileNameParam: string | null }) {
  const router = useRouter();

  // フルパス: "directory/fileName" 形式（APIに渡す際に使用）
  const fullFilePath = directoryParam && fileNameParam
    ? `${directoryParam}/${fileNameParam}`
    : fileNameParam;

  const [fileName, setFileName] = useState<string | null>(fullFilePath);
  const [inputText, setInputText] = useState<string>("");
  const [bookmarkText, setBookmarkText] = useState<string>("");
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState<boolean>(false);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // 振り仮名表示状態
  const [showFurigana, setShowFurigana] = useState<boolean>(false);

  // 読書設定
  const [fontSize, setFontSize] = useState<number>(READER_CONFIG.DEFAULT_FONT_SIZE);
  const [lineHeight, setLineHeight] = useState<number>(READER_CONFIG.DEFAULT_LINE_HEIGHT);

  // 説明サイドバー状態
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [selectedSentence, setSelectedSentence] = useState<string>("");
  const [sentenceContext, setSentenceContext] = useState<string>("");

  // Book metadata and image mapping
  const { imageMap } = useBookMetadata(fileNameParam, directoryParam);

  // localStorageから設定を読み込み
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 振り仮名設定
      const storedFurigana = localStorage.getItem(STORAGE_KEYS.FURIGANA_ENABLED);
      if (storedFurigana !== null) {
        setShowFurigana(storedFurigana === 'true');
      }

      // フォントサイズ
      const storedFontSize = localStorage.getItem(STORAGE_KEYS.READER_FONT_SIZE);
      if (storedFontSize) {
        setFontSize(parseInt(storedFontSize, 10));
      }

      // 行間
      const storedLineHeight = localStorage.getItem(STORAGE_KEYS.READER_LINE_HEIGHT);
      if (storedLineHeight) {
        setLineHeight(parseFloat(storedLineHeight));
      }

      // 振り仮名変更イベント監視
      const handleFuriganaChange = (event: Event) => {
        const customEvent = event as CustomEvent<{ enabled: boolean }>;
        setShowFurigana(customEvent.detail.enabled);
      };

      window.addEventListener('furiganaChanged', handleFuriganaChange);

      return () => {
        window.removeEventListener('furiganaChanged', handleFuriganaChange);
      };
    }
  }, []);

  // フォントサイズ変更
  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.READER_FONT_SIZE, size.toString());
    }
  };

  // 行間変更
  const handleLineHeightChange = (height: number) => {
    setLineHeight(height);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.READER_LINE_HEIGHT, height.toString());
    }
  };

  // URL パラメータの変更を監視
  useEffect(() => {
    if (fullFilePath) {
      setFileName(fullFilePath);
    }
  }, [fullFilePath]);

  // ファイルリストを取得
  useEffect(() => {
    const fetchFileList = async () => {
      try {
        const response = await fetch('/api/list-text-files');
        if (response.ok) {
          const data = await response.json();
          setAvailableFiles(data.files);

          // ファイルが指定されていない場合、最初のファイルにリダイレクト
          if (!fileNameParam && data.files.length > 0) {
            const params = new URLSearchParams();
            if (directoryParam) params.set('directory', directoryParam);
            params.set('fileName', data.files[0]);
            router.replace(`/book-reader?${params.toString()}`);
          }
        }
      } catch (e) {
        console.error('ファイルリストの取得に失敗しました:', e);
      }
    };

    fetchFileList();
  }, [fileNameParam, directoryParam, router]);

  // パラグラフに分割（メモ化）
  const paragraphs = useMemo(() => {
    if (!inputText) return [];

    return inputText
      .split(READER_CONFIG.PARAGRAPH_SPLIT_PATTERN)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }, [inputText]);

  // 文のリストをメモ化（コンテキスト抽出用）
  const allSentences = useMemo(() => {
    const allText = paragraphs.map(p => stripFurigana(p)).join('\n');
    return allText.split(/[。！？]/g).filter(s => s.trim().length > 0);
  }, [paragraphs]);

  // 文がクリックされたときの処理
  const handleSentenceClick = (sentence: string) => {
    const cleanSentence = stripFurigana(sentence).trim();
    const sentenceIndex = allSentences.findIndex(s =>
      s.trim().includes(cleanSentence) || cleanSentence.includes(s.trim())
    );

    if (sentenceIndex === -1) {
      console.warn('文が見つかりませんでした:', sentence);
      setSentenceContext('');
    } else {
      let contextSize: number = EXPLANATION_CONFIG.DEFAULT_CONTEXT_SIZE;
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEYS.EXPLANATION_CONTEXT_SIZE);
        if (stored) {
          contextSize = parseInt(stored, 10);
        }
      }

      const startIndex = Math.max(0, sentenceIndex - contextSize);
      const endIndex = Math.min(allSentences.length, sentenceIndex + contextSize + 1);
      const contextSentences = allSentences.slice(startIndex, endIndex);

      setSentenceContext(contextSentences.join('。'));
    }

    setSelectedSentence(sentence);
    setIsSidebarOpen(true);
  };

  // ブックマークを再取得
  const refetchBookmark = async () => {
    if (!fileName) return;

    try {
      const response = await fetch(`/api/read-bookmark?fileName=${fileName}`, {
        method: "GET",
      });
      if (response.ok) {
        const data = await response.json();
        setBookmarkText(data.text);
        setRefreshTrigger(prev => prev + 1);
      } else {
        console.error(response);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // テキストコンテンツとブックマークを取得
  useEffect(() => {
    if (!fileName) return;

    const fetchData = async () => {
      try {
        const response = await fetch(`/api/read-public-txt?fileName=${fileName}`, {
          method: "GET",
        });
        if (response.ok) {
          const data = await response.json();
          setInputText(data.text);
        } else {
          console.error(response);
          setInputText("");
        }
      } catch (e) {
        console.error(e);
        setInputText("");
      }
    };

    const fetchBookmark = async () => {
      try {
        const response = await fetch(`/api/read-bookmark?fileName=${fileName}`, {
          method: "GET",
        });
        if (response.ok) {
          const data = await response.json();
          setBookmarkText(data.text);
        } else {
          console.error(response);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const loadAllData = async () => {
      setIsInitialLoadComplete(false);
      await Promise.all([fetchData(), fetchBookmark()]);
      setIsInitialLoadComplete(true);
    };

    loadAllData();
  }, [fileName]);

  // ブックマーク比較用に正規化
  const normalizeForComparison = (text: string): string => {
    const stripped = stripFurigana(text);
    return stripped.replace(/[\r\n]/g, '').trim();
  };

  // ファイルがない場合
  if (availableFiles.length === 0 && !fileName) {
    return (
      <div className="mx-2 md:mx-12 lg:mx-36 my-5 pb-24 md:pb-5">
        <div
          className="p-6 border"
          style={{
            backgroundColor: COLORS.SURFACE,
            borderColor: COLORS.NEUTRAL,
          }}
        >
          <h2 className="font-mincho font-bold text-xl mb-4" style={{ color: COLORS.INK }}>
            テキストファイルが見つかりません
          </h2>
          <p className="text-sm mb-4" style={{ color: COLORS.SECONDARY }}>
            public/ ディレクトリに .txt ファイルを追加してください。
          </p>
        </div>
      </div>
    );
  }

  // データ読み込み中
  if (!inputText || !isInitialLoadComplete) {
    return <div className="mx-2 md:mx-12 lg:mx-36 my-5 pb-24 md:pb-5 text-sm" style={{ color: COLORS.SECONDARY }}>コンテンツを読み込み中...</div>;
  }

  return (
    <div className="mx-2 md:mx-12 lg:mx-36 my-5 pb-24 md:pb-5">
      <Sidebar
        setDropdownAlwaysOpen={() => {}}
        dropdownAlwaysOpen={false}
        fileName={fileName}
        refreshTrigger={refreshTrigger}
      />

      {/* 読書設定コントロール */}
      <div className="hidden md:block fixed top-20 right-4 z-40 w-64">
        <ReadingControls
          fontSize={fontSize}
          lineHeight={lineHeight}
          onFontSizeChange={handleFontSizeChange}
          onLineHeightChange={handleLineHeightChange}
        />
      </div>

      <ExplanationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sentence={selectedSentence}
        context={sentenceContext}
        fileName={fileName || ''}
        showFurigana={showFurigana}
      />

      {paragraphs.map((paragraph, index) => {
        const isBookmarked = !!(bookmarkText &&
          normalizeForComparison(paragraph).includes(normalizeForComparison(bookmarkText)));

        return (
          <ParagraphItem
            {...(isBookmarked ? { id: "bookmark" } : {})}
            key={index}
            text={paragraph}
            isBookmarked={isBookmarked}
            fileName={fileName || ''}
            showFurigana={showFurigana}
            onBookmarkSuccess={refetchBookmark}
            onSentenceClick={handleSentenceClick}
            imageMap={imageMap}
          />
        );
      })}
    </div>
  );
}

// Main export with Suspense boundary
export default function BookReader() {
  return (
    <Suspense fallback={<div className="mx-2 md:mx-12 lg:mx-36 my-5 pb-24 md:pb-5 text-sm" style={{ color: COLORS.SECONDARY }}>読み込み中...</div>}>
      <SearchParamsReader>
        {({ directory, fileName }) => (
          <BookReaderContent directoryParam={directory} fileNameParam={fileName} />
        )}
      </SearchParamsReader>
    </Suspense>
  );
}
