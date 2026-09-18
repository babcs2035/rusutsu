"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useOfflineMap } from "./useOfflineMap";
import { useScrollSession } from "./useScrollSession";

export type UserPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};
type LocationState = {
  position: UserPosition | null;
  loading: boolean;
  enabled: boolean;
  error: string | null;
  selectResort: (id: string) => void;
  request: () => void;
  stop: () => void;
};
const LocationContext = createContext<LocationState | null>(null);
export const useMapSession = () => useContext(LocationContext);

export function MapSessionProvider({
  children,
  onSelectResort,
}: {
  children: ReactNode;
  onSelectResort: (id: string) => void;
}) {
  useOfflineMap();
  useScrollSession();
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(true);
  const generation = useRef(0);
  useEffect(() => {
    const sync = () => {
      setAttempt(value => value + 1);
      setVisible(document.visibilityState === "visible");
      setPosition(null);
    };
    document.addEventListener("visibilitychange", sync);
    const hide = () => {
      setVisible(false);
      setPosition(null);
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", sync);
    };
  }, []);
  const request = useCallback(() => {
    setError(null);
    setPosition(null);
    setLoading(true);
    setEnabled(true);
    setAttempt(value => value + 1);
  }, []);
  const stop = useCallback(() => {
    setEnabled(false);
    setLoading(false);
    setPosition(null);
    setError(null);
  }, []);

  useEffect(() => {
    // attempt は取得失敗後の再試行にも使う。
    void attempt;
    if (!enabled || !visible) {
      setLoading(false);
      return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      setError("現在地を取得できません。HTTPSで開いてください。");
      setLoading(false);
      setEnabled(false);
      return;
    }
    const current = ++generation.current;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    const watch = navigator.geolocation.watchPosition(
      result => {
        if (generation.current !== current) return;
        const { latitude, longitude, accuracy } = result.coords;
        if (
          ![latitude, longitude, accuracy].every(Number.isFinite) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180 ||
          accuracy < 0
        )
          return;
        setPosition({
          latitude,
          longitude,
          accuracy,
          timestamp: result.timestamp,
        });
        setLoading(false);
        setError(null);
        clearTimeout(expiry);
        expiry = setTimeout(() => {
          setPosition(null);
          setError("現在地を更新できません。もう一度取得してください。");
        }, 60_000);
      },
      failure => {
        if (generation.current !== current) return;
        setPosition(null);
        setLoading(false);
        setError(
          failure.code === 1
            ? "位置情報が許可されていません。Safariの位置情報設定を確認してください。"
            : failure.code === 3
              ? "現在地の取得に時間がかかっています。もう一度お試しください。"
              : "現在地を取得できません。電波の届く場所でお試しください。",
        );
        if (failure.code === 1) setEnabled(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
    return () => {
      generation.current++;
      navigator.geolocation.clearWatch(watch);
      clearTimeout(expiry);
    };
  }, [attempt, enabled, visible]);

  return (
    <LocationContext
      value={{
        position,
        loading,
        enabled,
        error,
        request,
        stop,
        selectResort: onSelectResort,
      }}
    >
      {children}
    </LocationContext>
  );
}
