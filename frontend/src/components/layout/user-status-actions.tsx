import React from "react";

type Props = {
  variant?: string;
  onOpenShortcuts?: () => void;
  onOpenPlugins?: () => void;
};

export function UserStatusActions({ variant, onOpenShortcuts, onOpenPlugins }: Props) {
  return <div className="flex items-center gap-1.5 text-xs text-stone-500">{variant}</div>;
}
