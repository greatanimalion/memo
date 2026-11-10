import React from "react";

type Props = { id?: string; title?: string; children?: React.ReactNode; onClick?: () => void };

export function PromptCard({ title, children, onClick }: Props) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3" onClick={onClick}>
      {title && <h3 className="font-medium">{title}</h3>}
      {children}
    </div>
  );
}
