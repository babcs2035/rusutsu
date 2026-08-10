"use client";

import Image from "next/image";
import { useState } from "react";
import type { AdminUser } from "@/app/admin/actions";
import { deleteUser, updateUserRole } from "@/app/admin/actions";

interface UserManagementProps {
  users: AdminUser[];
}

export function UserManagement({ users }: UserManagementProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      setMessage("ロールを更新しました");
      setError("");
      window.location.reload();
    } catch {
      setError("ロールの更新に失敗しました");
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("このユーザーを削除しますか？")) return;
    try {
      await deleteUser(userId);
      setMessage("ユーザーを削除しました");
      setError("");
      window.location.reload();
    } catch {
      setError("ユーザーの削除に失敗しました");
    }
  };

  return (
    <div>
      {message && (
        <div
          style={{
            background: "#d4edda",
            color: "#155724",
            padding: "0.75rem",
            borderRadius: "4px",
            marginBottom: "1rem",
          }}
        >
          {message}
        </div>
      )}
      {error && (
        <div
          style={{
            background: "#f8d7da",
            color: "#721c24",
            padding: "0.75rem",
            borderRadius: "4px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

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
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
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
                    style={{
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.875rem",
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
    </div>
  );
}
