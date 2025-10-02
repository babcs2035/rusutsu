"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { SkiResortT } from "@/types";

type Props = {
  resort: SkiResortT;
  onClose: () => void;
};

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({ resort, onClose }: Props) => {
  return (
    // モーダル全体を覆うコンテナ（z-indexを高く設定）
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-0 md:p-6">
      {/* 背景のオーバーレイ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
      />

      {/* モーダル本体 */}
      <motion.div
        variants={{
          hidden: { opacity: 0, scale: 0.95 },
          visible: { opacity: 1, scale: 1 },
        }}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        // SPでは画面いっぱいに、PCではモーダルウィンドウに
        className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl md:h-[90vh] md:max-h-[800px] md:w-[90vw] md:max-w-4xl md:rounded-2xl"
      >
        {/* ヘッダー画像と閉じるボタン */}
        <div className="relative h-48 w-full flex-shrink-0 md:h-64">
          {resort.outline?.images && resort.outline.images.length > 0 && (
            <Image
              src={resort.outline.images[0]}
              alt={resort.name.ja}
              layout="fill"
              objectFit="cover"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-full bg-black/40 p-1 text-2xl text-white transition-colors hover:bg-black/60"
            aria-label="詳細モーダルを閉じる"
          >
            &times;
          </button>
          <h2 className="absolute bottom-4 left-4 text-2xl font-bold text-white md:text-3xl">
            {resort.name.ja}
            {resort.outline?.images && resort.outline.images.length > 0 && (
              <span className="ml-2 text-sm font-normal">
                {resort.outline.images}
              </span>
            )}
          </h2>
        </div>

        {/* スクロール可能なコンテンツエリア */}
        <div className="flex-grow overflow-y-auto p-4 md:p-6">
          <h3 className="text-xl font-semibold">概要</h3>
          <p className="mt-2 text-gray-700">
            {resort.outline?.description?.long}
          </p>
          {/* TODO: ここに以前のタブUIと他の詳細情報を実装 */}
        </div>
      </motion.div>
    </div>
  );
};
