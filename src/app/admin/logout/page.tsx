import Link from "next/link";

export default function LogoutPage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          textAlign: "center",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        <h2 style={{ marginBottom: "1rem", color: "#333" }}>
          ログアウトしました
        </h2>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            marginBottom: "2rem",
          }}
        >
          <Link
            href="/admin/login"
            style={{
              display: "inline-block",
              padding: "0.6rem 1.5rem",
              background: "#003366",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid #003366",
            }}
          >
            ログイン画面へ
          </Link>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "0.6rem 1.5rem",
              background: "white",
              color: "#003366",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid #003366",
            }}
          >
            トップページへ
          </Link>
        </div>
      </div>
    </div>
  );
}
