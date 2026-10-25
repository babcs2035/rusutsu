"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublicProfile } from "@/features/community/actions";
import { PostCard } from "@/features/community/CommunityFeed";
import type { PublicAuthor, PublicPost } from "@/features/community/contract";
export default function CommunityProfile() {
  const { id } = useParams<{ id: string }>();
  const [author, setAuthor] = useState<PublicAuthor | null>(null);
  const [posts, setPosts] = useState<PublicPost[]>([]);
  useEffect(() => {
    void getPublicProfile(id).then(r => {
      if (r.ok) {
        setAuthor(r.data.author);
        setPosts(r.data.posts);
      }
    });
  }, [id]);
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/" className="text-sm underline">
        ← スキー場を探す
      </Link>
      <h1 className="text-xl font-bold">
        {author?.publicName ?? "プロフィール"}
      </h1>
      <h2 className="font-semibold">投稿履歴</h2>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
      {author && posts.length === 0 && (
        <p className="text-sm text-gray-500">投稿はありません。</p>
      )}
    </main>
  );
}
