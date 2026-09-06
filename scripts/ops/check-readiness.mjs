const base = process.argv[2] ?? "http://127.0.0.1:3000/rusutsu";
try {
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["/rusutsu", "/rusutsu/"].includes(url.pathname) ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Invalid readiness destination.");
  for (const suffix of ["/api/ready", ""]) {
    const response = await fetch(`${base.replace(/\/$/, "")}${suffix}`, {
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
      cache: "no-store",
    });
    if (response.status !== 200) throw new Error("not ready");
    // Consume the streaming page as well: an early 200 alone is insufficient.
    await response.arrayBuffer();
  }
} catch {
  console.error("Rusutsu readiness check failed.");
  process.exit(1);
}
