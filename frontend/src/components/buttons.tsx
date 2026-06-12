import { type ReactNode, type ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function IconButton({ children, className = "", ...props }: IconButtonProps) {
  return (
    <button className={`icon-btn ${className}`} {...props}>
      {children}
    </button>
  );
}

interface TbtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean;
  accent?: boolean;
  children: ReactNode;
}

export function Tbtn({ on, accent, children, className = "", ...props }: TbtnProps) {
  const cls = ["tbtn", on ? "on" : "", accent ? "accent" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function PrimaryButton({ children, className = "", ...props }: BtnProps) {
  return (
    <button className={`btn-primary ${className}`} {...props}>
      {children}
    </button>
  );
}

export function GhostButton({ children, className = "", ...props }: BtnProps) {
  return (
    <button className={`btn-ghost ${className}`} {...props}>
      {children}
    </button>
  );
}
