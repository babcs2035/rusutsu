import { getAdminDashboardData } from "@/app/admin/actions";
import { UserManagement } from "@/app/admin/UserManagement";
import { AdminHeader } from "@/components/AdminHeader";

export default async function AdminDashboardPage() {
  const dashboardData = await getAdminDashboardData();

  return (
    <div>
      <AdminHeader />
      <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "1.5rem", fontSize: "1.75rem" }}>
          管理ダッシュボード
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3
              style={{
                margin: "0 0 0.5rem 0",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              ユーザー数
            </h3>
            <p style={{ margin: 0, fontSize: "2rem", fontWeight: "bold" }}>
              {dashboardData.userCount}
            </p>
          </div>

          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <h3
              style={{
                margin: "0 0 0.5rem 0",
                fontSize: "0.875rem",
                color: "#666",
              }}
            >
              管理者数
            </h3>
            <p style={{ margin: 0, fontSize: "2rem", fontWeight: "bold" }}>
              {dashboardData.adminCount}
            </p>
          </div>
        </div>

        <UserManagement users={dashboardData.users} />

        <h2
          style={{
            marginTop: "2rem",
            marginBottom: "1rem",
            fontSize: "1.25rem",
          }}
        >
          編集ツール
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <a
            href="/rusutsu/admin/lift_edit"
            style={{
              display: "block",
              padding: "1rem",
              background: "white",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              fontWeight: 500,
            }}
          >
            リフト入力
          </a>
          <a
            href="/rusutsu/admin/slope_edit"
            style={{
              display: "block",
              padding: "1rem",
              background: "white",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              fontWeight: 500,
            }}
          >
            コース入力
          </a>
          <a
            href="/rusutsu/admin/ticket_edit"
            style={{
              display: "block",
              padding: "1rem",
              background: "white",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              fontWeight: 500,
            }}
          >
            リフトチケット入力
          </a>
          <a
            href="/rusutsu/admin/review_edit"
            style={{
              display: "block",
              padding: "1rem",
              background: "white",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              fontWeight: 500,
            }}
          >
            レビュー入力
          </a>
        </div>
      </div>
    </div>
  );
}
