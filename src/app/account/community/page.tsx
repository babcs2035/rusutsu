"use client";

import { useRouter } from "next/navigation";
import { AccountCommunityDialog } from "@/features/community/AccountCommunityDialog";

export default function CommunityAccountPage() {
  const router = useRouter();
  return (
    <AccountCommunityDialog
      initialView="settings"
      onClose={() => router.push("/")}
    />
  );
}
