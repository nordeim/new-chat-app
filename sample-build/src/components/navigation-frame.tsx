"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactElement } from "react";

interface NavigationFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactElement;
}

export default function NavigationFrame({ open, onOpenChange, children }: NavigationFrameProps) {
  if (!open) return children;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Overlay asChild>
        <button className="mobile-scrim" aria-label="Close navigation" onClick={() => onOpenChange(false)} />
      </Dialog.Overlay>
      <Dialog.Content
        asChild
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.focus();
        }}
      >
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
