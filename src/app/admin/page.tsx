import Link from "next/link";
import { getAdminDashboardData } from "@/app/admin/actions";
import { UserManagement } from "@/app/admin/UserManagement";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

// Admin dashboard requires live database access and authentication.
// Disable prerendering to avoid DB connection failures during build.
export const dynamic = "force-dynamic";

const TOOL_LINKS: Array<{ href: string; label: string }> = [
  { href: "/admin/lift", label: "リフト入力" },
  { href: "/admin/slope", label: "コース入力" },
  { href: "/admin/ticket", label: "リフトチケット入力" },
  { href: "/admin/review", label: "レビュー入力" },
];

export default async function AdminDashboardPage() {
  const dashboardData = await getAdminDashboardData();

  return (
    <div className="p-6 md:p-8 max-w-[1200px] mx-auto min-h-[calc(100vh-64px)]">
      <h1 className="mb-6 text-2xl md:text-3xl font-bold text-gray-900 font-[var(--font-heading)]">
        管理ダッシュボード
      </h1>

      <UserManagement users={dashboardData.users} />

      <h2 className="mt-8 mb-4 text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        編集ツール
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {TOOL_LINKS.map(link => (
          <Link key={link.href} href={link.href} className="block h-full">
            <Card className="shadow-lg transition-all duration-200 h-full border-gray-200 hover:border-gray-300 hover:-translate-y-0.5">
              <CardContent className="p-4 flex items-center">
                <CardTitle className="text-sm font-medium text-gray-700">
                  {link.label}
                </CardTitle>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
