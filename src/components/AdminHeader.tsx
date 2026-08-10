import Image from "next/image";
import { auth, signOut } from "@/auth";

export async function AdminHeader() {
  const session = await auth();
  const user = session?.user as
    | { name?: string; email?: string; role?: string; image?: string }
    | undefined;

  return (
    <header
      style={{
        background: "#003366",
        color: "white",
        padding: "0.5rem 2rem",
        minHeight: "64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontWeight: "bold", fontSize: "1rem" }}>Rusutsu</span>
        <span style={{ fontSize: "1rem", opacity: 0.9 }}>管理画面</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          justifyContent: "flex-end",
        }}
      >
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {user.image && (
              <Image
                src={user.image}
                alt="Profile"
                width={28}
                height={28}
                style={{
                  borderRadius: "50%",
                  border: "2px solid white",
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                {user.name || user.email}
              </div>
              <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                {user.role === "admin" ? "管理者" : "閲覧者"}
              </div>
            </div>
          </div>
        )}

        {user && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/logout" });
            }}
          >
            <button
              type="submit"
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.3)",
                color: "white",
                padding: "0.35rem 0.75rem",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              ログアウト
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
