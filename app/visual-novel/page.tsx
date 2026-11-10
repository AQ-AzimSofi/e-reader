"use client";

import React from "react";
import { useState, useCallback } from "react";
import { parseMarkdown } from "@/lib/utils/markdownParser";
import CollapsibleItem from "@/app/components/reading/CollapsibleItem";
import { ai_instructions } from "@/lib/ai";
import { VN_RETRY_CONFIG, AI_MODELS, API_ROUTES, COLORS } from "@/lib/constants";

export default function Home() {
  const aiInstructions: string = ai_instructions;
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState<boolean>(false);

  const findLastPTagContent = (): string | null => {
    if (typeof document !== "undefined") {
      const pElements = document.querySelectorAll("p");
      if (pElements.length > 0) {
        const lastP = pElements[pElements.length - 1];
        return lastP.textContent;
      }
      return null;
    }
    return null;
  };

  const handleButtonClick = useCallback(
    async (initialInstruction = aiInstructions) => {
      if (isLoading) return;

      setIsLoading(true);
      let currentInstruction = initialInstruction;
      let attempt = 0;
      let success = false;
      let apiResponseData = null;

      while (attempt < VN_RETRY_CONFIG.MAX_ATTEMPTS && !success) {
        try {
          const contentToPrompt = findLastPTagContent();
          if (contentToPrompt === null) {
            console.error("No target P tag content found");
            setIsLoading(false);
            return;
          }

          const res = await fetch(API_ROUTES.GEMINI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt_post: currentInstruction + contentToPrompt,
              ai_model: AI_MODELS.GEMINI_FLASH
            }),
        });
        if (res.ok) {
          const text = await res.text();
          apiResponseData = JSON.parse(text);
        } else {
          console.error(res.statusText);
        }

        const parsedItems = parseMarkdown(apiResponseData.response);
          const allItemsValid = parsedItems.every(
            (item) =>
              item.head && item.head.length > 0 && item.subItems.length > 0
          );

          if (allItemsValid && parsedItems.length > 0) {
            success = true;
          } else {
            currentInstruction =
              "回答のフォーマットが正しくありません。もう一度やり直してください。必ず下記の構成に従ってください。\n" +
              aiInstructions;
          }
        } catch (error) {
          console.error('API request failed:', error);
        }
        attempt++;
      }

      if (success && apiResponseData) {
        setResponse(apiResponseData.response);
      } else {
        console.error(`Failed after ${attempt} attempts`);
        setResponse("エラー: 正しい形式の応答が得られませんでした。");
        setIsError(true);
      }
      setIsLoading(false);
    },
    [aiInstructions, isLoading]
  );

  const handleFlushButtonClick = () => {
    const pElements = document.querySelectorAll("p");
    if (pElements.length > 0) {
      for (let i = 0; i < pElements.length - 1; i++) {
        pElements[i].innerHTML = "";
      }
    }
  };

  return (
    <div
      className="p-2 flex flex-col"
      style={{ backgroundColor: COLORS.BASE, color: COLORS.INK }}
    >
      <span
        style={{
          height: "20rem",
          overflow: "auto",
          alignContent: "end",
        }}
      ></span>
      <input
        value={aiInstructions + findLastPTagContent()}
        type="hidden"
        readOnly
      />
              <button
              onClick={handleFlushButtonClick}
              className="min-h-11 px-5 text-sm font-bold border hover:cursor-pointer transition-colors"
              style={{
                backgroundColor: 'transparent',
                borderColor: COLORS.INK,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = COLORS.NEUTRAL_SOFT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              クリア
            </button>
      <button
        onClick={() => handleButtonClick()}
        className={`min-h-11 px-5 mt-2 text-sm font-bold hover:cursor-pointer transition-colors ${
          isLoading ? "opacity-50 cursor-not-allowed" : ""
        }`}
        style={{
          backgroundColor: COLORS.PRIMARY,
          color: COLORS.SURFACE,
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = COLORS.PRIMARY_DARK;
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = COLORS.PRIMARY;
        }}
        disabled={isLoading}
      >
        {isLoading ? "処理中..." : "最後のPタグ"}
      </button>
      <div className="">
        {parseMarkdown(response, isError).map((item, index) => (
          <CollapsibleItem
            key={index}
            head={item.head}
            subItems={item.subItems}
            initialDropdownState={true}
            onSubmitSuccess={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
