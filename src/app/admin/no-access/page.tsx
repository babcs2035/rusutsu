import Link from "next/link";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] w-full items-center justify-center">
      {/* 背景グラデーションは admin layout.tsx が単一情報源として提供するため，ページ側では指定しない（p0002 §17） */}
      <Card className="w-full max-w-[400px] rounded-xl shadow-lg border-gray-200">
        <CardHeader className="text-center space-y-3">
          <CardTitle className="text-xl font-bold text-gray-900">
            権限がありません
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            管理画面には管理者アカウントのみアクセスできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex w-full gap-3">
            <Link href="/" className="flex-1">
              <Button
                variant="outline"
                className="w-full border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                トップページへ
              </Button>
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/admin/logout" });
              }}
              className="flex-1"
            >
              <Button
                type="submit"
                variant="outline"
                className="w-full border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                ログアウト
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
