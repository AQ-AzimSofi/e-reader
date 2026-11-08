"use client";

import React, { useEffect, useState } from "react";
import BookmarkUnfilled from "@/app/components/icons/BookmarkUnfilled";
import BookmarkFilled from "@/app/components/icons/BookmarkFilled";
import TranslateIcon from "@/app/components/icons/TranslateIcon";
import StartHereIcon from "@/app/components/icons/StartHereIcon";
import BookImage from "@/app/components/reading/BookImage";
import TTSButton from "@/app/components/reading/TTSButton";
import { useSearchParams } from "next/navigation";
import { COLORS, EXPLANATION_CONFIG, DARK_COLORS } from "@/lib/constants";
import { parseFurigana, segmentsToHTML } from "@/lib/utils/furiganaParser";
import { bookImagePath } from "@/lib/utils/bookAssetPath";
import { guestKeyHeaders, promptGuestKeyOnFailure } from "@/lib/guestKeys";

const IMAGE_PATTERN = /\[IMAGE:([^\]]+)\]/;

interface CollapsibleItemProps {
  id?: string;
  globalIndex?: number;
  head: string;
  subItems: string[];
  initialDropdownState?: boolean;
  onSubmitSuccess: () => void;
  showFurigana?: boolean;
  aiExplanationEnabled?: boolean;
  isDarkMode?: boolean;
  onSentenceClick?: (sentence: string) => void;
  imageMap?: Record<string, string>;
  bookDirectory?: string;
  bookFileName?: string;
  currentPage?: number;
  audiobookEnabled?: boolean;
  isStartCursor?: boolean;
  isPlaying?: boolean;
  onStartFromHere?: (unitIndex: number) => void;
  onVocabularySelect?: (data: {
    word: string;
    sentence: string;
    paragraphText: string;
  }) => void;
  onStartContinuousPlay?: () => void;
}

const CollapsibleItem: React.FC<CollapsibleItemProps> = ({
  id,
  globalIndex,
  head,
  subItems,
  initialDropdownState = false,
  onSubmitSuccess,
  showFurigana = false,
  aiExplanationEnabled = true,
  isDarkMode = false,
  onSentenceClick,
  imageMap,
  bookDirectory,
  bookFileName,
  currentPage,
  audiobookEnabled,
  isStartCursor,
  isPlaying,
  onStartFromHere,
  onVocabularySelect,
  onStartContinuousPlay,
}) => {
  const searchParams = useSearchParams();
  const directoryParam = searchParams.get("directory");
  const fileNameParam = searchParams.get("fileName");
  const highlightWord = searchParams.get("highlight");

  const fileName: string =
    (directoryParam && fileNameParam
      ? `${directoryParam}/${fileNameParam}`
      : fileNameParam) || "text-1";

  const [isOpen, setIsOpen] = useState(initialDropdownState);
  const [loading, setLoading] = useState(false);
  const [vocabularyMode, setVocabularyMode] = useState(false);
  const [shouldHighlight, setShouldHighlight] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [unavailableImagePaths, setUnavailableImagePaths] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const handleVocabularyModeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>;
      setVocabularyMode(customEvent.detail.enabled);
    };

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("vocabulary_mode");
      if (stored !== null) {
        setVocabularyMode(stored === "true");
      }
    }

    window.addEventListener("vocabularyModeChanged", handleVocabularyModeChange);
    return () =>
      window.removeEventListener(
        "vocabularyModeChanged",
        handleVocabularyModeChange
      );
  }, []);

  useEffect(() => {
    if (highlightWord && head.includes(highlightWord)) {
      setShouldHighlight(true);
      const timer = setTimeout(() => {
        setShouldHighlight(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightWord, head]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    setIsOpen(initialDropdownState);
  }, [initialDropdownState]);

  function KanjiReadingMeaningSplit(item: string) {
    const kanji = item.split("[")[0];
    let reading: string = "";
    let meaning: string = "";
    if (item.includes("[") && item.includes("]")) {
      if (item.split("[")[1].split("]")[0].includes("\u30FB")) {
        reading = item.split("[")[1].split("\u30FB")[0];
        meaning = item.split("[")[1].split("\u30FB")[1].replace("]", "").trim();
      } else {
        reading = "";
        meaning = item.split("[")[1].split("]")[0];
      }
    } else {
      console.error("error: ", item);
    }

    return { kanji, reading, meaning };
  }

  function Jisho(
    subItem: string
  ): { kanji: string; reading: string; meaning: string }[] {
    let parsed: string[] = [];
    if (subItem.includes("\uFF0A")) {
      parsed = subItem.split("\uFF0A");
    } else if (subItem.includes("]")) {
      parsed = subItem.split("]");
      const mappedParsed = parsed.map((element) => {
        return element + "]";
      });
      mappedParsed.pop();
      parsed = mappedParsed;
    } else if (subItem.includes("\u3001")) {
      parsed = subItem.split("\u3001");
    } else {
      if (
        !(
          subItem === "\u7121\u3044" ||
          subItem === "\u306A\u3044" ||
          subItem === "\u7121\u3057" ||
          subItem === "\u306A\u3057" ||
          subItem === "\u7121"
        )
      ) {
        console.error("Error: ", subItem);
      }
      parsed = [subItem];
    }
    const words: { kanji: string; reading: string; meaning: string }[] = [];
    const multipleDefinition: string[] = [];
    parsed.forEach((item) => {
      if (item.includes("[") && item.includes("]")) {
        words.push(KanjiReadingMeaningSplit(item));
      } else {
        multipleDefinition.push(item);
        if (item.includes("]")) {
          words.push(KanjiReadingMeaningSplit(multipleDefinition.toString()));
          multipleDefinition.length = 0;
        }
      }
    });
    return words;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await fetch("/api/write-bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target: fileName, content: head, page: currentPage }),
      });
      if (!response.ok) {
        throw new Error("Failed");
      }
      onSubmitSuccess();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslateClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (showTranslation) {
      setShowTranslation(false);
      return;
    }

    if (translatedText) {
      setShowTranslation(true);
      return;
    }

    try {
      setTranslating(true);
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...guestKeyHeaders("translate"),
        },
        body: JSON.stringify({ text: head }),
      });

      if (!response.ok) {
        await promptGuestKeyOnFailure("translate", response);
        throw new Error("Translation failed");
      }

      const data = await response.json();
      setTranslatedText(data.translatedText);
      setShowTranslation(true);
    } catch (error) {
      console.error("Translation error:", error);
    } finally {
      setTranslating(false);
    }
  };

  const extractTextWithoutRuby = (range: Range): string => {
    const fragment = range.cloneContents();
    const rtElements = fragment.querySelectorAll("rt");
    rtElements.forEach((rt) => rt.remove());
    return fragment.textContent || "";
  };

  const handleTextSelection = () => {
    if (!vocabularyMode || !onVocabularySelect) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const cleanedText = extractTextWithoutRuby(range).trim();

    if (!cleanedText) return;

    onVocabularySelect({
      word: cleanedText,
      sentence: head,
      paragraphText: head,
    });

    selection.removeAllRanges();
  };

  const splitIntoSentences = (text: string): string[] => {
    const delimiters: readonly string[] = EXPLANATION_CONFIG.SENTENCE_DELIMITERS;
    const sentences: string[] = [];
    let currentSentence = "";

    for (let i = 0; i < text.length; i++) {
      currentSentence += text[i];

      if (delimiters.includes(text[i])) {
        sentences.push(currentSentence.trim());
        currentSentence = "";
      }
    }

    if (currentSentence.trim()) {
      sentences.push(currentSentence.trim());
    }

    return sentences.filter((s) => s.length > 0);
  };

  const handleTripleClickSelect = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail >= 3) {
      e.stopPropagation();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(e.currentTarget);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  const renderTextWithFurigana = (
    text: string,
    isClickable: boolean = false
  ) => {
    if (!isClickable || !aiExplanationEnabled) {
      const segments = parseFurigana(text);
      const html = segmentsToHTML(segments, showFurigana);
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }

    const sentences = splitIntoSentences(text);

    return (
      <>
        {sentences.map((sentence, index) => {
          const segments = parseFurigana(sentence);
          const html = segmentsToHTML(segments, showFurigana);

          return (
            <span
              key={index}
              dangerouslySetInnerHTML={{ __html: html }}
              onClick={(e) => {
                e.stopPropagation();
                if (!vocabularyMode) onSentenceClick?.(sentence);
              }}
              className={
                onSentenceClick && !vocabularyMode
                  ? "cursor-pointer transition-colors rounded-md px-1"
                  : ""
              }
              style={
                onSentenceClick && !vocabularyMode
                  ? {
                      backgroundColor: "transparent",
                      transition: "background-color 0.2s ease",
                    }
                  : {}
              }
              onMouseEnter={(e) => {
                if (onSentenceClick && !vocabularyMode) {
                  e.currentTarget.style.backgroundColor =
                    "rgba(0, 122, 255, 0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (onSentenceClick && !vocabularyMode) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            />
          );
        })}
      </>
    );
  };

  const hasImage = IMAGE_PATTERN.test(head);

  const resolveImage = (originalName: string) => {
    const actualFileName =
      imageMap?.[originalName] ||
      imageMap?.[`image/${originalName}`] ||
      originalName;
    const imagePath = bookImagePath(bookDirectory ?? "", bookFileName ?? "", actualFileName);
    return { actualFileName, imagePath };
  };

  const markImageUnavailable = (imagePath: string) =>
    setUnavailableImagePaths((previous) => new Set(previous).add(imagePath));

  const parseContentWithImages = (content: string) => {
    const parts: Array<{ type: "text" | "image"; content: string }> = [];
    let lastIndex = 0;
    const regex = /\[IMAGE:([^\]]+)\]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.substring(lastIndex, match.index);
        if (textBefore.trim()) {
          parts.push({ type: "text", content: textBefore });
        }
      }

      const imageName = match[1];
      parts.push({ type: "image", content: imageName });

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      const textAfter = content.substring(lastIndex);
      if (textAfter.trim()) {
        parts.push({ type: "text", content: textAfter });
      }
    }

    return parts;
  };

  const renderHeadWithImages = () => {
    if (showTranslation && translatedText) {
      return (
        <span style={{ color: isDarkMode ? "#E5E5EA" : "#636366" }}>
          {translatedText}
        </span>
      );
    }

    if (!hasImage) {
      return renderTextWithFurigana(head, true);
    }

    const parts = parseContentWithImages(head);

    return (
      <div className="head-content">
        {parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <div key={index} className="whitespace-pre-wrap">
                {renderTextWithFurigana(part.content, true)}
              </div>
            );
          } else {
            const { actualFileName, imagePath } = resolveImage(part.content);
            return (
              <BookImage
                key={index}
                fileName={actualFileName}
                imagePath={imagePath}
                altText={`Illustration from ${bookFileName}`}
                onUnavailable={() => markImageUnavailable(imagePath)}
              />
            );
          }
        })}
      </div>
    );
  };

  const isBookmarked = id === "bookmark";

  const containerStyle: React.CSSProperties = isPlaying
    ? {
        borderLeft: `4px solid ${COLORS.PLAYING}`,
        backgroundColor: "rgba(52, 199, 89, 0.08)",
      }
    : shouldHighlight
    ? {
        backgroundColor: isDarkMode
          ? "rgba(10, 132, 255, 0.08)"
          : "rgba(0, 122, 255, 0.06)",
        borderLeft: "none",
        transition: "background-color 3s ease, border-left 3s ease",
      }
    : isStartCursor
      ? {
          borderLeft: `4px solid ${COLORS.START_CURSOR}`,
          backgroundColor: "rgba(255, 149, 0, 0.06)",
        }
      : isBookmarked
        ? {
            borderLeft: `4px solid ${isDarkMode ? DARK_COLORS.PRIMARY : "#007AFF"}`,
            backgroundColor: isDarkMode
              ? "rgba(10, 132, 255, 0.06)"
              : "rgba(0, 122, 255, 0.03)",
          }
        : {};

  const buttonBaseStyle: React.CSSProperties = {
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    border: "none",
    background: "none",
    cursor: "pointer",
    transition: "transform 0.15s ease, background-color 0.15s ease",
    flexShrink: 0,
  };

  const hoverBg = isDarkMode
    ? "rgba(255, 255, 255, 0.06)"
    : "rgba(0, 0, 0, 0.04)";

  // A line whose original is only illustrations, none of which exist, would be an empty card.
  const headParts = hasImage ? parseContentWithImages(head) : [];
  const isOnlyUnavailableImages =
    headParts.length > 0 &&
    headParts.every(
      (part) => part.type === "image" && unavailableImagePaths.has(resolveImage(part.content).imagePath)
    );
  if (isOnlyUnavailableImages) {
    return null;
  }

  return (
    <div className="collapsibleItem" id={id} data-global-index={globalIndex} style={{ scrollMarginTop: '80px' }}>
      <div
        className="p-4 my-4 rounded-xl"
        style={{
          transition: "background-color 3s ease, border-left 0.2s ease",
          ...containerStyle,
        }}
        id="collapsible-item"
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
          <div className="flex-1 min-w-0">
            <div
              className="head-text font-bold text-lg whitespace-pre-wrap"
              onMouseUp={handleTextSelection}
              onClickCapture={handleTripleClickSelect}
              style={{
                color: isDarkMode ? DARK_COLORS.TEXT : "#1D1D1F",
                ...(vocabularyMode || !aiExplanationEnabled
                  ? { userSelect: "text" as const, cursor: "text" }
                  : {}),
              }}
            >
              {renderHeadWithImages()}
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 pt-0.5 self-end sm:self-auto">
            {audiobookEnabled && onStartFromHere && globalIndex != null && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartFromHere(globalIndex);
                }}
                style={buttonBaseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = hoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.9)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                aria-label="Set audio start here"
                title="Start audio from here"
              >
                <StartHereIcon isActive={isStartCursor} />
              </button>
            )}
            <TTSButton text={head} onLongPress={onStartContinuousPlay} />
            <button
              disabled={translating}
              onClick={handleTranslateClick}
              style={{
                ...buttonBaseStyle,
                opacity: translating ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = hoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.9)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              aria-label="Translate"
            >
              <TranslateIcon isActive={showTranslation} />
            </button>
            <form
              onSubmit={handleSubmit}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex"
            >
              <button
                disabled={loading}
                type="submit"
                style={buttonBaseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = hoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.9)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                aria-label="Bookmark"
              >
                {isBookmarked ? <BookmarkFilled /> : <BookmarkUnfilled />}
              </button>
            </form>
            {subItems.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOpen();
                }}
                style={buttonBaseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = hoverBg;
                  const svg = e.currentTarget.querySelector("svg");
                  if (svg) svg.style.fill = "#8E8E93";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  const svg = e.currentTarget.querySelector("svg");
                  if (svg) svg.style.fill = "#D1D1D6";
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.9)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 640 640"
                  width="16"
                  height="16"
                  style={{
                    fill: "#D1D1D6",
                    transition: "transform 200ms ease, fill 200ms ease",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="mt-3">
            {subItems.map((subItem, index) => (
              <div
                key={index}
                className="sub-item-text rounded-xl mb-2"
                onClick={handleTripleClickSelect}
                style={
                  isDarkMode
                    ? {
                        color: "#E5E5EA",
                        backgroundColor: "#2C2C2E",
                        border: `1px solid ${DARK_COLORS.NEUTRAL}`,
                        padding: "12px 16px",
                      }
                    : {
                        color: "#636366",
                        backgroundColor: "rgba(0, 122, 255, 0.03)",
                        border: "1px solid rgba(0, 122, 255, 0.06)",
                        padding: "12px 16px",
                      }
                }
              >
                {index === 4 ? "" : renderTextWithFurigana(subItem, false)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollapsibleItem;
