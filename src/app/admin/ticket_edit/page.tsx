import type { Metadata } from "next";
import { AdminHeader } from "@/components/AdminHeader";
import {
  readEnumLabels,
  readTicketSchemaSpec,
} from "@/features/ticket-edit/server/schemaSpec";
import {
  listTicketFiles,
  readTicketForEdit,
} from "@/features/ticket-edit/server/ticketFiles";
import { TicketEditWorkspace } from "@/features/ticket-edit/TicketEditWorkspace";
import type { TicketFileOption } from "@/features/ticket-edit/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "リフト券編集 | 管理画面",
};

export default async function TicketEditPage() {
  const [ticketFiles, schemaSpec, enumLabels, resorts] = await Promise.all([
    listTicketFiles(),
    readTicketSchemaSpec(),
    readEnumLabels(),
    prisma.skiResort.findMany({
      select: { id: true, nameJa: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const nameById = new Map(resorts.map(resort => [resort.id, resort.nameJa]));
  const files: TicketFileOption[] = ticketFiles
    .map(file => ({
      ...file,
      // スキー場の名称は SkiResort マスタが正本。
      // リフト券JSONは resort.id しか持たないので、ここで引く。
      resortName: nameById.get(file.resortId) ?? file.resortId,
    }))
    .sort(
      (left, right) =>
        left.resortName.localeCompare(right.resortName, "ja") ||
        left.fileName.localeCompare(right.fileName),
    );

  const first = files[0];
  const initialData = first
    ? await readTicketForEdit(first.resortId, first.fileName)
    : null;

  return (
    <div>
      <AdminHeader />
      <TicketEditWorkspace
        files={files}
        resortOptions={resorts.map(resort => ({
          id: resort.id,
          name: resort.nameJa,
        }))}
        schemaSpec={schemaSpec}
        enumLabels={enumLabels}
        initialData={initialData}
      />
    </div>
  );
}
