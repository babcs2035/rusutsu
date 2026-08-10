"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { adminToaster } from "@/app/admin/AdminToaster";
import type { AdminUser } from "@/app/admin/actions";
import { deleteUser, updateUserRole } from "@/app/admin/actions";

export function UserManagement({ users }: { users: AdminUser[] }) {
  const router = useRouter();

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      adminToaster.create({ title: "ロールを更新しました", type: "success" });
      router.refresh();
    } catch {
      adminToaster.create({
        title: "ロールの更新に失敗しました",
        type: "error",
      });
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("このユーザーを削除しますか？")) return;
    try {
      await deleteUser(userId);
      adminToaster.create({ title: "ユーザーを削除しました", type: "success" });
      router.refresh();
    } catch {
      adminToaster.create({
        title: "ユーザーの削除に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <div
      style={{
        background: "white",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr style={{ background: "#f8f9fa" }}>
            <th
              style={{
                padding: "0.75rem",
                textAlign: "left",
                borderBottom: "1px solid #dee2e6",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              名前
            </th>
            <th
              style={{
                padding: "0.75rem",
                textAlign: "left",
                borderBottom: "1px solid #dee2e6",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              メールアドレス
            </th>
            <th
              style={{
                padding: "0.75rem",
                textAlign: "left",
                borderBottom: "1px solid #dee2e6",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              ロール
            </th>
            <th
              style={{
                padding: "0.75rem",
                textAlign: "center",
                borderBottom: "1px solid #dee2e6",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {user.image && (
                    <Image
                      src={user.image}
                      alt=""
                      width={24}
                      height={24}
                      style={{
                        borderRadius: "50%",
                      }}
                    />
                  )}
                  {user.name || "-"}
                </div>
              </td>
              <td
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                {user.email || "-"}
              </td>
              <td
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                <select
                  value={user.role}
                  onChange={e => handleRoleChange(user.id, e.target.value)}
                  disabled={user.isEnvAdmin}
                  style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                    opacity: user.isEnvAdmin ? 0.5 : 1,
                  }}
                >
                  <option value="viewer">閲覧者</option>
                  <option value="admin">管理者</option>
                </select>
              </td>
              <td
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                  textAlign: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleDelete(user.id)}
                  disabled={user.isEnvAdmin}
                  style={{
                    background: "#dc3545",
                    color: "white",
                    border: "none",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "4px",
                    cursor: user.isEnvAdmin ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    opacity: user.isEnvAdmin ? 0.5 : 1,
                  }}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
