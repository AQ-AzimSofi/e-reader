"use client";

import React, { useState } from "react";
import BookmarkUnfilled from "@/app/components/icons/BookmarkUnfilled";
import BookmarkFilled from "@/app/components/icons/BookmarkFilled";
import TranslateIcon from "@/app/components/icons/TranslateIcon";
import StartHereIcon from "@/app/components/icons/StartHereIcon";
import BookImage from "@/app/components/reading/BookImage";
import { COLORS, EXPLANATION_CONFIG } from "@/lib/constants";
import { parseFurigana, segmentsToHTML } from "@/lib/utils/furiganaParser";
import { toTint } from "@/lib/utils/colorTint";
import { bookImagePath } from "@/lib/utils/bookAssetPath";
import { guestKeyHeaders, promptGuestKeyOnFailure } from "@/lib/guestKeys";

const IMAGE_PATTERN = /\[IMAGE:([^\]]+)\]/;

interface ParagraphItemProps {
  id?: string;
  globalIndex?: number;
  text: string;
  isBookmarked: boolean;
  fileName: string;
  showFurigana: boolean;
  onBookmarkSuccess: () => void;
  onSentenceClick?: (sentence: string) => void;
  imageMap?: Record<string, string>;
  currentPage?: number;
  audiobookEnabled?: boolean;
  isStartCursor?: boolean;
  isPlaying?: boolean;
  onStartFromHere?: (unitIndex: number) => void;
}

const ParagraphItem: React.FC<ParagraphItemProps> = ({
  id,
  globalIndex,
  text,
  isBookmarked,
  fileName,
  showFurigana,
  onBookmarkSuccess,
  onSentenceClick,
  imageMap,
  currentPage,
  audiobookEnabled,
  isStartCursor,
  isPlaying,
  onStartFromHere,
}) => {
  const [loading, setLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [unavailableImagePaths, setUnavailableImagePaths] = useState<ReadonlySet<string>>(() => new Set());

  const handleBookmarkClick = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await fetch("/api/write-bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target: fileName, content: text, page: currentPage }),
      });
      if (!response.ok) {
        throw new Error("Failed");
      }
      onBookmarkSuccess();
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
        body: JSON.stringify({ text }),
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

  const hasImage = IMAGE_PATTERN.test(text);

  // fileName is the reader's full "<directory>/<file>" path.
  const pathSeparatorIndex = fileName.lastIndexOf("/");
  const resolveImage = (originalName: string) => {
    const actualFileName =
      imageMap?.[originalName] ||
      imageMap?.[`image/${originalName}`] ||
      originalName;
    const imagePath = bookImagePath(
      fileName.slice(0, pathSeparatorIndex),
      fileName.slice(pathSeparatorIndex + 1),
      actualFileName
    );
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

  const splitIntoSentences = (sentenceText: string): string[] => {
    const delimiters: readonly string[] = EXPLANATION_CONFIG.SENTENCE_DELIMITERS;
    const sentences: string[] = [];
    let currentSentence = "";

    for (let i = 0; i < sentenceText.length; i++) {
      currentSentence += sentenceText[i];

      if (delimiters.includes(sentenceText[i])) {
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
    renderText: string,
    isClickable: boolean = false
  ) => {
    if (!isClickable || !onSentenceClick) {
      const segments = parseFurigana(renderText);
      const html = segmentsToHTML(segments, showFurigana);
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }

    const sentences = splitIntoSentences(renderText);

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
                onSentenceClick(sentence);
              }}
              className="cursor-pointer transition-colors px-1"
              style={{
                backgroundColor: "transparent",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = toTint(COLORS.PRIMARY, 10);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            />
          );
        })}
      </>
    );
  };

  const renderContentWithImages = () => {
    if (showTranslation && translatedText) {
      return (
        <div
          className="head-text font-bold text-lg whitespace-pre-wrap"
          style={{ color: COLORS.SECONDARY_DARK }}
        >
          {translatedText}
        </div>
      );
    }

    if (!hasImage) {
      return (
        <div
          className="head-text font-bold text-lg whitespace-pre-wrap"
          onClickCapture={handleTripleClickSelect}
        >
          {renderTextWithFurigana(text, true)}
        </div>
      );
    }

    const parts = parseContentWithImages(text);

    return (
      <div className="paragraph-content">
        {parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <div
                key={index}
                className="head-text font-bold text-lg whitespace-pre-wrap"
                onClickCapture={handleTripleClickSelect}
              >
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
                altText={`Illustration from ${fileName}`}
                onUnavailable={() => markImageUnavailable(imagePath)}
              />
            );
          }
        })}
      </div>
    );
  };

  const buttonBaseStyle: React.CSSProperties = {
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "2px",
    border: "none",
    background: "none",
    cursor: "pointer",
    transition: "transform 0.15s ease, background-color 0.15s ease",
  };

  // A paragraph made only of illustrations, none of which exist, would be an empty card.
  const paragraphParts = hasImage ? parseContentWithImages(text) : [];
  const isOnlyUnavailableImages =
    paragraphParts.length > 0 &&
    paragraphParts.every(
      (part) => part.type === "image" && unavailableImagePaths.has(resolveImage(part.content).imagePath)
    );
  if (isOnlyUnavailableImages) {
    return null;
  }

  return (
    <div className="paragraph-item" id={id} data-global-index={globalIndex} style={{ scrollMarginTop: '80px' }}>
      <div
        className="p-4 my-4"
        style={{
          backgroundColor: isPlaying
            ? toTint(COLORS.PLAYING, 10)
            : isStartCursor
              ? toTint(COLORS.START_CURSOR, 7)
              : isBookmarked
                ? toTint(COLORS.PRIMARY, 7)
                : "transparent",
          borderLeft: isPlaying
            ? `2px solid ${COLORS.PLAYING}`
            : isStartCursor
              ? `2px solid ${COLORS.START_CURSOR}`
              : isBookmarked
                ? `2px solid ${COLORS.PRIMARY}`
                : "none",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
          <div className="flex-1 min-w-0">{renderContentWithImages()}</div>
          <div className="flex items-center gap-0.5 flex-shrink-0 pt-0.5 self-end sm:self-auto">
        {audiobookEnabled && onStartFromHere && globalIndex != null && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartFromHere(globalIndex);
            }}
            style={buttonBaseStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = toTint(COLORS.INK, 4);
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
        <button
          disabled={translating}
          onClick={handleTranslateClick}
          style={{
            ...buttonBaseStyle,
            opacity: translating ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = toTint(COLORS.INK, 4);
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
          onSubmit={handleBookmarkClick}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            disabled={loading}
            type="submit"
            style={buttonBaseStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = toTint(COLORS.INK, 4);
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParagraphItem;
