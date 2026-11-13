"use client";

import { useRouter } from "next/navigation";
import { AccountCommunityDialog } from "@/features/community/AccountCommunityDialog";

export default function AccountPostsPage() {
  const router = useRouter();
  return (
    <AccountCommunityDialog
      initialView="posts"
      onClose={() => router.push("/")}
    />
  );
}
