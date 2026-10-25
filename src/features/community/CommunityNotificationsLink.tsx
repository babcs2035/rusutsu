"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getNotifications } from "./actions";

export function CommunityNotificationsLink() {
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
    <Link
      className="text-sm font-medium text-sky-800 underline"
      href="/account/community"
    >
      コミュニティ設定・通知
      {count > 0 && (
        <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
