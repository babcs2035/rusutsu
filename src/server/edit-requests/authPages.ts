import "server-only";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/requireEditor";
import { canEdit } from "@/lib/roles";
export async function requireEditingPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/admin/login");
  if (!canEdit(actor.role)) redirect("/admin/no-access");
  return actor;
}
export async function requireAdminPage() {
  const actor = await requireEditingPage();
  if (actor.role !== "admin") redirect("/admin/no-access");
  return actor;
}
