import React, { createContext, useContext, useState } from "react";

type SelectContextValue = {
  open: boolean;
  value: string;
  onOpenChange: (next: boolean) => void;
  onValueChange: (v: string) => void;
};
const SelectCtx = createContext<SelectContextValue | null>(null);

export function Select({
  open,
  onOpenChange,
  value,
  onValueChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  value?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(open ?? false);
  const [localValue, setLocalValue] = useState(value ?? "");
  const ctx: SelectContextValue = {
    open: open ?? localOpen,
    value: value ?? localValue,
    onOpenChange: (next) => {
      setLocalOpen(next);
      onOpenChange?.(next);
    },
    onValueChange: (v) => {
      setLocalValue(v);
      onValueChange?.(v);
    },
  };
  return <SelectCtx.Provider value={ctx}>{children}</SelectCtx.Provider>;
}

export function SelectTrigger({ className, children, ...rest }: React.HTMLAttributes<HTMLButtonElement>) {
  const ctx = useContext(SelectCtx);
  return (
    <button
      type="button"
      className={className}
      onClick={() => ctx?.onOpenChange(!ctx.open)}
      data-canvas-no-zoom
      {...rest}
    >
      {children}
    </button>
  );
}

export function SelectContent({
  children,
  position,
  side,
  sideOffset,
  align,
  className,
  ...rest
}: {
  children?: React.ReactNode;
  position?: string;
  side?: string;
  sideOffset?: number;
  align?: string;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ctx = useContext(SelectCtx);
  if (!ctx?.open) return null;
  return (
    <div className={className} data-position={position} data-side={side} data-align={align} data-side-offset={sideOffset} {...rest}>
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
  disabled,
  textValue,
}: {
  value: string;
  children?: React.ReactNode;
  disabled?: boolean;
  textValue?: string;
}) {
  const ctx = useContext(SelectCtx);
  return (
    <div
      role="option"
      aria-disabled={disabled}
      onClick={() => !disabled && ctx?.onValueChange(value)}
      data-value={value}
    >
      {children}
    </div>
  );
}

export { SelectLabel, SelectSeparator, SelectGroup, SelectValue } from "./select-shared";
