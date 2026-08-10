import { AdminToaster } from "@/app/admin/AdminToaster";
import { AdminHeader } from "@/components/AdminHeader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <AdminHeader />
      <AdminToaster />
      {children}
    </div>
  );
}
