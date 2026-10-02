import { AdminChrome } from "@/app/admin/AdminChrome";
import { AdminToaster } from "@/app/admin/AdminToaster";
import { AdminHeader } from "@/components/AdminHeader";
import { getCurrentActor } from "@/lib/requireEditor";
import { EditorAccess } from "./EditorAccess";
import "./admin.css";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentActor();
  return (
    <EditorAccess role={actor?.role ?? "viewer"}>
      <div className="admin-shell min-h-dvh min-w-0 bg-gradient-to-b from-gray-100 to-gray-200">
        <AdminChrome>
          <AdminHeader />
        </AdminChrome>
        <AdminToaster />
        {children}
      </div>
    </EditorAccess>
  );
}
