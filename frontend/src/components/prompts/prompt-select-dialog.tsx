import React from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: string) => void;
};

export function PromptSelectDialog({ open, onOpenChange, onSelect }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => onOpenChange(false)}>
      <div className="rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-stone-500">提示选择对话框（待实现）</p>
      </div>
    </div>
  );
}
