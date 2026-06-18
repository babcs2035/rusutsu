import { useEffect, useState } from "react";
import { SIDE_PANEL_MEDIA_QUERY } from "../constants";

export const useSidePanelLayout = () => {
  const [isSidePanelLayout, setIsSidePanelLayout] = useState(false);

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
