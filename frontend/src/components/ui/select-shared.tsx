import React from "react";

export function SelectLabel({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest}>{children}</div>;
}
export function SelectSeparator({ ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} />;
}
export function SelectGroup({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="group" {...rest}>{children}</div>;
}
export function SelectValue({ children, placeholder, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { placeholder?: string }) {
  return <span {...rest}>{children || placeholder}</span>;
}
