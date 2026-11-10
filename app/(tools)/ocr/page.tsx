"use client";
import { useState } from "react";
import { marked } from "marked";
import { ai_instructions_picture } from "@/lib/ai";
import { API_ROUTES, AI_MODELS, COLORS } from "@/lib/constants";

export default function Home() {
  const exampleResponse = `<p>6 データベース</p> <hr> <p>参照 データがどのような形式で格納されているのかといった物理的な構造を一切意識せずにデータベース操作ができるのは、利用者とデータベースの間に、論理データモデルが介在するため。つまり、利用者は、論理データモデルを意識するだけでデータベース操作ができる。</p> <hr> <h2>論理データモデル</h2> <p>論理データモデルは、データベース構造モデルとも呼ばれるデータモデルです。利用者とデータベース間のインタフェースの役割を担うデータモデルであるため、どのデータベースを用いて実装するかによって、用いられる論理データモデルが異なります。</p> <p>▼表6.1.1 論理データモデルの種類と特徴</p> <ul> <li><p><strong>階層モデル</strong></p> <ul> <li><strong>階層型データベースの論理データモデル</strong><ul> <li>階層構造（木構造）でデータの構造を表現する。親レコードに対する子レコードは複数存在するが、子レコードに対する親レコードはただ1つだけという特徴がある。このため、親子間の"多対多"の関係を表現しようとすると冗長な表現となる</li> </ul> </li> </ul> </li> <li><p><strong>網モデル</strong></p> <ul> <li><strong>網（ネットワーク）型データベースの論理データモデル</strong><ul> <li>レコード同士を網構造で表現する。親子間の"多対多"の関係も表現できる。ネットワークモデルともいう</li> </ul> </li> </ul> </li> <li><p><strong>関係モデル</strong></p> <ul> <li><strong>関係型データベースの論理データモデル</strong><ul> <li>データを2次元の表（テーブル）で表現する。1つの表は独立した表であり、階層モデルや網モデルがもつ親レコードと子レコードという関係はもたない</li> </ul> </li> </ul> </li> </ul> <hr> <p>参照 関係モデルについては、p.296も参照。</p> <hr> <h2>関係モデルへの変換</h2> <p>関係データベースを用いて実装する場合、概念データモデルを基に、主キーや外部キーを含めたテーブル構造を作成します。その際、テーブルの各列（データ項目）に設定される非NULL制約や検査制約などの検討も行います。<strong>非NULL制約</strong>とは空値（NULL）の登録を許可しないという制約、<strong>検査制約</strong>は登録できるデータの値や範囲を設定する制約です。</p> <p>また、個々のアプリケーションプログラムや利用者が使いやすいようにビューの設計（定義）を行うのもこの段階です。</p> <hr> <p>参照 ビューについて参照は、p.329を参照。</p> <hr> <p>▲図6.1.2 テーブル構造 主キー 外部キー 主キー 社員表 部門表 社員コード 社員名 部門コード 部門コード 部門名 ↑ 制約: 空値(NULL)は許可しない</p> <hr> <p>290</p>`;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [response, setResponse] = useState<string>(exampleResponse);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const aiInstruction: string = ai_instructions_picture;

  interface ApiResponseData {
    response: string;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      console.log("画像がありません");
      return;
    }
    setIsLoading(true);

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("prompt_post", aiInstruction);
    formData.append("ai_model", AI_MODELS.GEMINI_FLASH);
    try {
      const response = await fetch(API_ROUTES.GEMINI, {
        method: "POST",
        body: formData,
      });

      const apiResponseData: ApiResponseData = await response.json();
      console.log(apiResponseData);
      setResponse(apiResponseData.response);
      setIsLoading(false);
    } catch (error) {
      console.error("アップロードエラー：", error);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();

    setSelectedFile(event.target.files?.[0] || null);
  };

  function getResponseDivText() {
    if (typeof document !== "undefined") {
      const targetDiv = document.querySelector(".response");

      if (targetDiv) {
        const textContent = (targetDiv as HTMLElement).innerText;
        console.log(textContent);
        return textContent;
      } else {
        console.warn("要素が見つかりません。");
        return null;
      }
    }
    }
  getResponseDivText();

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center m-30 h-screen font-mincho font-bold text-5xl" style={{ color: COLORS.INK }}>
          AIで処理中...
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col items-center h-screen mt-5">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-4xl m-1 p-3 border text-sm"
              style={{
                backgroundColor: COLORS.SURFACE,
                borderColor: COLORS.NEUTRAL,
                color: COLORS.INK,
              }}
            />
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
            {/* <p className="border p-2 my-1">
              {marked(response, { async: false }) || "no response"}
            </p> */}
            <div className="w-1/2 mt-6 font-mincho response" style={{ lineHeight: "2rem", color: COLORS.INK }}>
              <div
                dangerouslySetInnerHTML={{ __html: marked(response, { async: false }) }}
              />
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
