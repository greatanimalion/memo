import React from "react";

type Props = {
  theme: string;
  targetTheme: string;
  onThemeChange: (theme: any) => void;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
  title?: string;
  children?: React.ReactNode;
};

export function AnimatedThemeToggler({ className, style, "aria-label": ariaLabel, title, children }: Props) {
  return (
    <button type="button" className={className} style={style} aria-label={ariaLabel} title={title}>
      {children}
    </button>
  );
}
