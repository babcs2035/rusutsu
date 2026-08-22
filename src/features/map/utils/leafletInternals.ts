import type L from "leaflet";

/**
 * Leaflet の内部 API へのアクセスをここに閉じ込める。
 *
 * ホイールズームを滑らかにするには、Leaflet がピンチズームで使っている
 * 「毎フレーム _move して、指を離したときに 1 回だけ確定させる」経路に
 * 乗せる必要がある。この経路は公開 API になっていない。
 *
 * 対象は leaflet 1.9 系（package.json で固定）。
 */
type MapInternals = {
  /**
   * 再投影せずに中心とズームだけを進める。
   * data.pinch を立てると、タイルもベクタも CSS transform で追従するだけになり、
   * タイルの読み直しやパスの再計算が走らない。
   */
  _move: (
    center: L.LatLng,
    zoom: number,
    data?: { pinch?: boolean; round?: boolean },
  ) => void;
  /** zoomend / moveend を発火させる */
  _moveEnd: (zoomChanged: boolean) => L.Map;
  /**
   * ズームを確定させて全レイヤを再投影する。
   * viewprereset を投げるため、タイルが一度すべて DOM から取り除かれる
   * （＝画面が一瞬白くなる）点に注意。
   */
  _resetView: (center: L.LatLng, zoom: number) => void;
  /** zoomSnap と min/max を適用したズーム値 */
  _limitZoom: (zoom: number) => number;
  /** ズーム確定までのアニメーション（TouchZoom の終了処理と同じもの） */
  _animateZoom: (
    center: L.LatLng,
    zoom: number,
    startAnim: boolean,
    noUpdate?: boolean,
  ) => void;
  _getNewPixelOrigin: (center: L.LatLng, zoom: number) => L.Point;
  _animatingZoom: boolean;
};

export const getMapInternals = (map: L.Map) =>
  map as unknown as L.Map & MapInternals;

/**
 * 指定したコンテナ座標を動かさずにズームしたときの新しい地図中心。
 * Leaflet の setZoomAround と同じ計算。
 */
export const getZoomAnchoredCenter = (
  map: L.Map,
  anchor: L.Point,
  zoom: number,
): L.LatLng => {
  const scale = map.getZoomScale(zoom, map.getZoom());
  const viewHalf = map.getSize().divideBy(2);
  const centerOffset = anchor.subtract(viewHalf).multiplyBy(1 - 1 / scale);
  return map.containerPointToLatLng(viewHalf.add(centerOffset));
};

/** ホイールの移動量を px に正規化する（行・ページ単位のイベントに対応） */
export const getWheelDeltaPx = (event: WheelEvent) => {
  if (event.deltaMode === 1) return event.deltaY * 20;
  if (event.deltaMode === 2) return event.deltaY * 60;
  return event.deltaY;
};
