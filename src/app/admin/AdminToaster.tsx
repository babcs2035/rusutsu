"use client";

import { Box, createToaster, Toast, Toaster } from "@chakra-ui/react";
import type { CSSProperties } from "react";

export const adminToaster = createToaster({
  placement: "top-end",
  duration: 3000,
});

export function AdminToaster() {
  const rootStyle: CSSProperties = {
    width: "380px",
    maxWidth: "100vw",
    padding: "12px 16px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  };

  const contentStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  return (
    <Toaster toaster={adminToaster}>
      {toast => (
        <Toast.Root id={toast.id} style={rootStyle}>
          <Toast.Indicator />
          <Box style={contentStyle}>
            {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
            {toast.description && (
              <Toast.Description>{toast.description}</Toast.Description>
            )}
          </Box>
          <Toast.CloseTrigger />
        </Toast.Root>
      )}
    </Toaster>
  );
}
