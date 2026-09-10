"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactElement } from "react";

interface NavigationFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactElement;
}

// Mobile navigation frame: when open, the sidebar becomes a modal Radix
// dialog — focus is contained inside, Escape closes it, and focus returns to
// the "Open navigation" control. When closed (or on desktop) children render
// in place. Radix hides the backdrop from assistive technology; the accessible
// close affordance stays inside the drawer.
export default function NavigationFrame({
  open,
  onOpenChange,
  children,
}: NavigationFrameProps) {
  if (!open) return children;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Overlay asChild>
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => onOpenChange(false)}
        />
      </Dialog.Overlay>
      <Dialog.Content
        asChild
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')
            ?.focus();
        }}
      >
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
