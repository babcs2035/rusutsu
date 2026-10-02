"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { UserRole } from "@/lib/roles";

const EditingRole = createContext<UserRole>("viewer");

export function EditorAccess({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  return <EditingRole.Provider value={role}>{children}</EditingRole.Provider>;
}

export function useEditingRole() {
  const role = useContext(EditingRole);
  return { role, isEditor: role === "editor", isAdmin: role === "admin" };
}
