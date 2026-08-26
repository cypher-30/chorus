"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Mobile bottom-sheet: fixed overlay, panel slides up from the bottom.
 * Used for Devices / Sync / Add music on small screens (design lines 239-240).
 */
export const Sheet = ({ open, onClose, title, children, className }: SheetProps) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={cn(
          "scrollbar-thin w-full max-w-[520px] max-h-[78vh] overflow-y-auto rounded-t-[20px] border-t border-border bg-sheet p-5",
          className
        )}
        style={{ animation: "sheet-in 0.22s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-base font-semibold">{title}</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-[18px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
