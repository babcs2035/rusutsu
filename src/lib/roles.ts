export const USER_ROLES = ["viewer", "editor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABELS: Record<UserRole, string> = {
  viewer: "閲覧者",
  editor: "編集者",
  admin: "管理者",
};

export function isUserRole(role: unknown): role is UserRole {
  return USER_ROLES.some(value => value === role);
}

export function canEdit(role: unknown): boolean {
  return role === "editor" || role === "admin";
}
