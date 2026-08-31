import { AdminChrome } from "@/app/admin/AdminChrome";
import { AdminToaster } from "@/app/admin/AdminToaster";
import { AdminHeader } from "@/components/AdminHeader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-200">
      <AdminChrome>
        <AdminHeader />
      </AdminChrome>
      <AdminToaster />
      {children}
    </div>
  );
}
