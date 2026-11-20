export const settings: Record<string, string> = {
  API_BEARER_TOKEN: "a".repeat(64),
  API_BASE_URL: "",
};

/** Builds disposable Docker metadata for deployment operation tests. */
export function existingContainers(): Array<{
  Config: { Image: string; Labels: Record<string, string>; Env: string[] };
  Mounts?: Array<{ Type: string; Name: string; Destination: string }>;
  HostConfig: {
    PortBindings: Record<string, Array<{ HostIp: string; HostPort: string }>>;
  };
}> {
  const base = { "com.docker.compose.project": "test-project" };
  return [
    {
      Config: {
        Image: "postgres:16-alpine",
        Labels: { ...base, "com.docker.compose.service": "db" },
        Env: [
          "POSTGRES_USER=existing_user",
          "POSTGRES_PASSWORD=sentinel-db-password",
          "POSTGRES_DB=existing_database",
          "PGDATA=/var/lib/postgresql/data",
        ],
      },
      Mounts: [
        {
          Type: "volume",
          Name: "existing-data",
          Destination: "/var/lib/postgresql/data",
        },
      ],
      HostConfig: {
        PortBindings: {
          "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "15432" }],
        },
      },
    },
    {
      Config: {
        Image: "test-image",
        Labels: { ...base, "com.docker.compose.service": "app" },
        Env: [
          "DATABASE_URL=postgresql://existing_user:sentinel-db-password@db:5432/existing_database",
          "AUTH_URL=https://example.test/rusutsu",
          "AUTH_SECRET=sentinel-auth-secret",
          "GOOGLE_CLIENT_ID=sentinel-google-client",
          "GOOGLE_CLIENT_SECRET=sentinel-google-secret",
          "ADMIN_EMAILS=admin@example.test",
        ],
      },
      HostConfig: {
        PortBindings: {
          "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "13000" }],
        },
      },
    },
  ];
}
