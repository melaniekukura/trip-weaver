import type { ReactNode } from "react";

type IconProps = { children: ReactNode; size?: number };

export function Icon({ children, size = 24 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function RouteIcon() {
  return (
    <Icon size={22}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M7.8 7.3c2 1.4 1.4 3.7 3.5 4.3 1.8.5 3.2-1.2 4.5-.2 1.2.9.9 3 .9 4.3" />
    </Icon>
  );
}

