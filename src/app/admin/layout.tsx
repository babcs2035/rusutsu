import { AdminChrome } from "@/app/admin/AdminChrome";
import { AdminToaster } from "@/app/admin/AdminToaster";
import { AdminHeader } from "@/components/AdminHeader";
import "./admin.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell min-h-dvh min-w-0 bg-gradient-to-b from-gray-100 to-gray-200">
      <AdminChrome>
        <AdminHeader />
      </AdminChrome>
      <AdminToaster />
      {children}
    </div>
  );
}
