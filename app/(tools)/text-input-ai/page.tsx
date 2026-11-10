"use client";
import React, { useState } from "react";
import { API_ROUTES, PAGE_ROUTES, COLORS } from "@/lib/constants";

export default function Home() {
    const [inputText, setInputText] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (e:React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;
        setIsLoading(true);
        const response = await fetch(API_ROUTES.WRITE_TEXT_AI, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ text: inputText }),
        });

        if (!response.ok) {
            console.error("AIテキスト処理に失敗しました");
        } else {
            console.log("AIテキスト処理が完了しました");
            setIsLoading(false);
        }

        setInputText("");
        window.location.replace(PAGE_ROUTES.HOME);
    }

    return (
        <div>
            {isLoading ? (
                <div className="flex justify-center m-30 h-screen font-mincho font-bold text-5xl" style={{ color: COLORS.INK }}>
                    AIで処理中...
                </div>
            ) : (
                // isLoadingがfalseの場合
                <div className="">
                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col items-center h-screen mt-5">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                className="w-4xl h-64 m-1 p-3 border focus:outline-none focus:ring-2"
                                style={{
                                  backgroundColor: COLORS.SURFACE,
                                  borderColor: COLORS.NEUTRAL,
                                  color: COLORS.INK,
                                  '--tw-ring-color': COLORS.PRIMARY,
                                } as React.CSSProperties}
                            ></textarea>
                            <button
                                type="submit"
                                className="min-h-11 px-5 text-sm font-bold hover:cursor-pointer w-4xl transition-colors"
                                style={{
                                  backgroundColor: COLORS.PRIMARY,
                                  color: COLORS.SURFACE,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = COLORS.PRIMARY_DARK;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = COLORS.PRIMARY;
                                }}
                            >
                                保存
                            </button>
                            <p className="mt-2 text-sm" style={{ color: COLORS.SECONDARY }}>文字数: {inputText.length}</p>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
