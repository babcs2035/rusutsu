import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import type { LngLat } from "../../types";
import type { EditorMapLine } from "./types";

export type EditorMapLabel = {
  id: string;
  text: string;
  coordinate: LngLat;
};

/** ラベルを置く位置。線のまんなかの頂点に出す */
const labelAnchor = (line: EditorMapLine): LngLat | null =>
  line.coordinates.length === 0
    ? null
    : line.coordinates[Math.floor(line.coordinates.length / 2)];

export const buildLabels = (
  lines: EditorMapLine[],
  labelText: (line: EditorMapLine, index: number) => string,
): EditorMapLabel[] =>
  lines.flatMap((line, index) => {
    const coordinate = labelAnchor(line);
    const text = labelText(line, index);
    if (!coordinate || text === "") return [];
    return [{ id: line.id, text, coordinate }];
  });

const createElement = (
  label: EditorMapLabel,
  isActive: boolean,
): HTMLElement => {
  const element = document.createElement("span");
  element.className = "editor-map-label";
  element.dataset.active = isActive ? "true" : "false";
  element.textContent = label.text;
  element.title = label.text;
  return element;
};

/**
 * 線の名前を地図に出す。
 *
 * スタイルに glyphs（フォント PBF）を積んでいないので symbol レイヤーは使えない。
 * 数はコース数ぶんしかないので DOM のマーカーで足りる。
 * 作り直すとちらつくので、同じ id のマーカーは中身だけ差し替える。
 */
export class EditorLabelLayer {
  private markers = new Map<string, { marker: Marker; element: HTMLElement }>();

  constructor(private readonly map: MapLibreMap) {}

  sync(labels: EditorMapLabel[], activeId: string | null): void {
    const seen = new Set<string>();
    for (const label of labels) {
      seen.add(label.id);
      const isActive = label.id === activeId;
      const existing = this.markers.get(label.id);
      if (existing) {
        if (existing.element.textContent !== label.text) {
          existing.element.textContent = label.text;
          existing.element.title = label.text;
        }
        existing.element.dataset.active = isActive ? "true" : "false";
        existing.marker.setLngLat(label.coordinate);
        continue;
      }
      const element = createElement(label, isActive);
      const marker = new Marker({ element, anchor: "bottom" })
        .setLngLat(label.coordinate)
        .addTo(this.map);
      this.markers.set(label.id, { marker, element });
    }

    for (const [id, entry] of this.markers) {
      if (seen.has(id)) continue;
      entry.marker.remove();
      this.markers.delete(id);
    }
  }

  clear(): void {
    for (const entry of this.markers.values()) entry.marker.remove();
    this.markers.clear();
  }
}
