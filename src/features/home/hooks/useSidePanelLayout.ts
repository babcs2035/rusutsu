import { useEffect, useState } from "react";
import { SIDE_PANEL_MEDIA_QUERY } from "../constants";

export const useSidePanelLayout = () => {
  // HomeClientの状態復元後にマウントされるので、初回から画面幅を判定する。
  const [isSidePanelLayout, setIsSidePanelLayout] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(SIDE_PANEL_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(SIDE_PANEL_MEDIA_QUERY);
    const syncSidePanelLayout = () => {
      setIsSidePanelLayout(mediaQuery.matches);
    };

    syncSidePanelLayout();
    mediaQuery.addEventListener("change", syncSidePanelLayout);
    return () => {
      mediaQuery.removeEventListener("change", syncSidePanelLayout);
    };
  }, []);

  return isSidePanelLayout;
};
