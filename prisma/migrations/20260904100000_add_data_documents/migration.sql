-- CreateTable
CREATE TABLE "data_documents" (
    "key" VARCHAR(1024) NOT NULL,
    "content" TEXT NOT NULL,
    "mediaType" VARCHAR(255) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_documents_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "data_documents_key_check" CHECK (
        "key" <> ''
        AND left("key", 1) <> '/'
        AND right("key", 1) <> '/'
        AND position(E'\\' in "key") = 0
        AND "key" !~ '//'
        AND "key" !~ '(^|/)\.{1,2}(/|$)'
        AND "key" !~ '[[:cntrl:]]'
    ),
    CONSTRAINT "data_documents_media_type_check" CHECK (
        "mediaType" ~ '^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+([[:space:]]*;[[:space:]]*.+)?$'
        AND "mediaType" !~ '[[:cntrl:]]'
    ),
    CONSTRAINT "data_documents_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "data_documents_version_check" CHECK ("version" > 0)
);
