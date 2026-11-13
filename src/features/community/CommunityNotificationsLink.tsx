"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getNotifications } from "./actions";

export function CommunityNotificationsLink({
  onOpen,
}: {
  onOpen: (view: "posts" | "settings") => void;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    void getNotifications().then(result => {
      if (active && result.ok) setCount(result.data.unreadCount);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        className="h-12 text-sm font-semibold text-gray-800"
        onClick={() => onOpen("posts")}
      >
        自分の投稿
      </Button>
      <Button
        variant="outline"
        className="h-12 text-sm font-semibold text-gray-800"
        onClick={() => onOpen("settings")}
      >
        設定
        {count > 0 && (
          <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">
            {count}
          </span>
        )}
      </Button>
    </div>
  );
}
