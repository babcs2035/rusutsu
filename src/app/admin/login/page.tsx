import { signInWithGoogle } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GoogleLogo } from "@/shared/components/GoogleLogo";

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] w-full items-center justify-center p-4">
      {/* 背景グラデーションは admin layout.tsx が単一情報源として提供するため，ページ側では指定しない（p0002 §17） */}
      <Card className="w-full max-w-[400px] rounded-xl shadow-lg border-gray-200">
        <CardHeader className="text-center space-y-3">
          <CardTitle className="text-xl font-bold text-gray-900">
            管理画面へログイン
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            Google アカウントでログインしてください
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <form action={signInWithGoogle}>
            <Button
              type="submit"
              variant="outline"
              className="flex w-full items-center justify-center gap-2 border border-gray-200 bg-white text-base rounded-lg hover:bg-gray-50 hover:text-gray-900 shadow-sm"
            >
              <GoogleLogo size={20} />
              Google でログイン
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
