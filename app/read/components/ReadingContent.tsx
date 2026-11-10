"use client";

import { useMemo, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { parseReaderItems } from "@/lib/utils/buildPlayableUnits";
import { stripFurigana } from "@/lib/utils/furiganaParser";
import { COLORS, PRIORITY_LEVELS, type PriorityScore } from "@/lib/constants";

const CollapsibleItem = dynamic(
  () => import("@/app/components/reading/CollapsibleItem"),
  { ssr: false }
);

const ParagraphItem = dynamic(
  () => import("@/app/components/reading/ParagraphItem"),
  { ssr: false }
);

type ContentType = "rephrase" | "furigana" | "plain";

interface ReadingContentProps {
  content: string;
  fileName: string;
  directory: string;
  bookmarkText: string;
  showFurigana: boolean;
  displayMode: "collapsed" | "expanded";
  aiExplanationEnabled: boolean;
  currentPage: number;
  itemsPerPage: number;
  isDarkMode: boolean;
  onBookmarkSuccess: () => void;
  onSentenceClick?: (sentence: string) => void;
  imageMap?: Record<string, string>;
  audiobookEnabled?: boolean;
  startCursorIndex?: number;
  playingIndex?: number;
  onStartFromHere?: (unitIndex: number) => void;
  priorityScores?: Record<number, PriorityScore>;
}

function detectContentType(text: string): ContentType {
  if (text.includes(">>") && (text.includes("<") || text.includes("\u003c"))) {
    return "rephrase";
  }
  if (/<ruby>/.test(text) || /[^\[\]]+\[[^\[\]]+\]/.test(text)) {
    return "furigana";
  }
  return "plain";
}

function normalizeForComparison(text: string): string {
  const stripped = stripFurigana(text);
  return stripped.replace(/[\r\n]/g, "").trim();
}

function priorityWrapperStyle(score: PriorityScore): CSSProperties {
  const level = PRIORITY_LEVELS[score];
  return {
    position: "relative",
    borderLeft: `${level.border}px solid ${level.color}`,
    paddingLeft: 26,
    opacity: level.opacity,
    borderRadius: 4,
    transition: "opacity 200ms ease",
  };
}

function PriorityBadge({ score }: { score: PriorityScore }) {
  const level = PRIORITY_LEVELS[score];
  return (
    <span
      title={`Importance ${score}/5 - ${level.label}`}
      style={{
        position: "absolute",
        left: 4,
        top: 4,
        width: 18,
        height: 18,
        borderRadius: "50%",
        backgroundColor: level.color,
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {score}
    </span>
  );
}

export default function ReadingContent({
  content,
  fileName,
  directory,
  bookmarkText,
  showFurigana,
  displayMode,
  aiExplanationEnabled,
  currentPage,
  itemsPerPage,
  isDarkMode,
  onBookmarkSuccess,
  onSentenceClick,
  imageMap,
  audiobookEnabled,
  startCursorIndex,
  playingIndex,
  onStartFromHere,
  priorityScores,
}: ReadingContentProps) {
  const contentType = useMemo(() => detectContentType(content), [content]);

  const fullFilePath = directory ? `${directory}/${fileName}` : fileName;

  const parsedItems = useMemo(() => parseReaderItems(content), [content]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return parsedItems.slice(start, end);
  }, [parsedItems, currentPage, itemsPerPage]);

  if (parsedItems.length === 0) {
    return (
      <div
        className="p-8 text-center font-gothic text-sm"
        style={{ border: `1px solid ${COLORS.NEUTRAL}` }}
      >
        <p style={{ color: COLORS.SECONDARY }}>No content to display</p>
      </div>
    );
  }

  if (contentType === "rephrase") {
    return (
      <div className="space-y-1">
        {paginatedItems.map((item, index) => {
          const typedItem = item as { head: string; subItems: string[] };
          const normalizedHead = normalizeForComparison(typedItem.head);
          const normalizedBookmark = normalizeForComparison(bookmarkText);
          const isBookmarked = !!(
            bookmarkText && normalizedHead === normalizedBookmark
          );
          const globalIndex = (currentPage - 1) * itemsPerPage + index;
          const priorityScore = priorityScores?.[globalIndex];

          const itemEl = (
            <CollapsibleItem
              key={`${currentPage}-${index}`}
              {...(isBookmarked ? { id: "bookmark" } : {})}
              globalIndex={globalIndex}
              head={typedItem.head}
              subItems={typedItem.subItems}
              initialDropdownState={displayMode === "expanded"}
              showFurigana={showFurigana}
              aiExplanationEnabled={aiExplanationEnabled}
              isDarkMode={isDarkMode}
              onSubmitSuccess={onBookmarkSuccess}
              onSentenceClick={onSentenceClick}
              imageMap={imageMap}
              bookDirectory={directory}
              bookFileName={fileName}
              currentPage={currentPage}
              audiobookEnabled={audiobookEnabled}
              isStartCursor={startCursorIndex === globalIndex}
              isPlaying={playingIndex === globalIndex}
              onStartFromHere={onStartFromHere}
            />
          );

          // Always the same wrapper + key so toggling Prioritize never remounts
          // the item (which would reset its open/translation state and flash).
          return (
            <div
              key={`${currentPage}-${index}`}
              style={priorityScore !== undefined ? priorityWrapperStyle(priorityScore) : undefined}
            >
              {priorityScore !== undefined && <PriorityBadge score={priorityScore} />}
              {itemEl}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {paginatedItems.map((item, index) => {
        const typedItem = item as { text: string };
        const normalizedText = normalizeForComparison(typedItem.text);
        const normalizedBookmark = normalizeForComparison(bookmarkText);
        const isBookmarked = !!(
          bookmarkText && normalizedText === normalizedBookmark
        );
        const globalIndex = (currentPage - 1) * itemsPerPage + index;
        const priorityScore = priorityScores?.[globalIndex];

        const itemEl = (
          <ParagraphItem
            key={`${currentPage}-${index}`}
            {...(isBookmarked ? { id: "bookmark" } : {})}
            globalIndex={globalIndex}
            text={typedItem.text}
            isBookmarked={isBookmarked}
            fileName={fullFilePath}
            showFurigana={showFurigana}
            onBookmarkSuccess={onBookmarkSuccess}
            onSentenceClick={onSentenceClick}
            imageMap={imageMap}
            currentPage={currentPage}
            audiobookEnabled={audiobookEnabled}
            isStartCursor={startCursorIndex === globalIndex}
            isPlaying={playingIndex === globalIndex}
            onStartFromHere={onStartFromHere}
          />
        );

        // Always the same wrapper + key so toggling Prioritize never remounts
        // the item (which would reset its open/translation state and flash).
        return (
          <div
            key={`${currentPage}-${index}`}
            style={priorityScore !== undefined ? priorityWrapperStyle(priorityScore) : undefined}
          >
            {priorityScore !== undefined && <PriorityBadge score={priorityScore} />}
            {itemEl}
          </div>
        );
      })}
    </div>
  );
}
