import type {
  getSkiResortById,
  getSkiResortsForMap,
} from "@/server/ski-resorts/queries";

export type MapSkiResort = Awaited<
  ReturnType<typeof getSkiResortsForMap>
>[number];

export type SkiResortDetail = NonNullable<
  Awaited<ReturnType<typeof getSkiResortById>>
>;

export type NullableSkiResortDetail = Awaited<
  ReturnType<typeof getSkiResortById>
>;
