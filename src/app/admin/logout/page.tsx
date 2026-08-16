import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LogoutPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      {/* 背景グラデーションは admin layout.tsx が単一情報源として提供するため，ページ側では指定しない（p0002 §17） */}
      <Card className="text-center max-w-[400px] rounded-xl shadow-lg border-gray-200">
        <CardHeader className="space-y-4">
          <CardTitle className="text-xl font-bold text-gray-900">
            ログアウトしました
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="flex gap-3">
            <Link href="/admin/login" className="flex-1">
              <Button variant="default" className="w-full shadow-sm">
                ログイン画面へ
              </Button>
            </Link>
            <Link href="/" className="flex-1">
              <Button
                variant="outline"
                className="w-full border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                トップページへ
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
