import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCurrentActor } from "@/lib/requireEditor";
import { ROLE_LABELS } from "@/lib/roles";

export async function AdminHeader() {
  const user = await getCurrentActor();

  return (
    <header className="flex h-16 items-center justify-between gap-2 md:gap-4 border-b border-white/10 bg-[var(--admin-dark)] px-4 md:px-8 shadow-md">
      <Link
        href="/admin"
        className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
      >
        <span className="text-lg font-bold text-white">Rusutsu</span>
        <span className="hidden text-lg text-white/80 md:inline">管理画面</span>
      </Link>

      <div className="flex min-w-0 items-center gap-2 md:gap-4">
        {user && (
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            {user.image && (
              <Avatar className="h-8 w-8 shrink-0 border-2 border-white/30">
                <Image
                  src={user.image}
                  alt="Profile"
                  fill
                  sizes="32px"
                  className="rounded-full object-cover"
                />
              </Avatar>
            )}
            {!user.image && user.name && (
              <Avatar className="h-8 w-8 shrink-0 border-2 border-white/30">
                <AvatarFallback className="bg-white/20 text-white text-sm">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">
                {user.name ||
                  (user.role === "admin" ? user.email : "ログイン中")}
              </div>
              <div className="text-xs text-white/70">
                {ROLE_LABELS[user.role]}
              </div>
            </div>
          </div>
        )}

        <Link href="/" className="shrink-0">
          <Button
            variant="outline"
            className="border-white/20 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
          >
            <span className="md:hidden">トップ</span>
            <span className="hidden md:inline">トップページ</span>
          </Button>
        </Link>

        {user && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/logout" });
            }}
            className="shrink-0"
          >
            <Button
              type="submit"
              variant="outline"
              className="border-white/20 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
            >
              ログアウト
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
