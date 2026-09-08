"use client";

import { Component, type ReactNode } from "react";

/** GPU リソース不足などの初期化例外も、ホーム画面全体を巻き込ませない。 */
export class MapErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="status"
        className="flex h-full flex-col items-center justify-center gap-3 bg-gray-50 p-4 text-sm"
      >
        <p>地図を読み込めませんでした。</p>
        <button
          type="button"
          className="min-h-11 rounded-md border bg-white px-5 shadow-sm"
          onClick={() => {
            this.setState({ failed: false });
            this.props.onRetry();
          }}
        >
          地図を再表示
        </button>
      </div>
    );
  }
}
