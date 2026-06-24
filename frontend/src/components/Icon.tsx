const ICONS: Record<string, string> = {
  play:     "M5 3.5v13l11-6.5z",
  pause:    "M6 4h3.2v12H6zM10.8 4H14v12h-3.2z",
  loop:     "M5 7h8 a3 3 0 0 1 0 6h-8 a3 3 0 0 1 0-6M10.5 4.5l2.5 2.5-2.5 2.5M7.5 10.5l-2.5 2.5 2.5 2.5",
  link:     "M8 12a3 3 0 0 1 0-4l2-2a3 3 0 0 1 4 4l-1 1M12 8a3 3 0 0 1 0 4l-2 2a3 3 0 0 1-4-4l1-1",
  lock:     "M7 9V7a3 3 0 0 1 6 0v2M5 9h10v8H5z",
  unlock:   "M7 9V7a3 3 0 0 1 5.6-1.7M5 9h10v8H5z",
  zoomIn:   "M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM14 14l3.5 3.5M9 6v6M6 9h6",
  zoomOut:  "M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM14 14l3.5 3.5M6 9h6",
  plus:     "M10 4v12M4 10h12",
  chevron:  "M5 7.5l5 5 5-5",
  x:        "M5 5l10 10M15 5L5 15",
  swap:     "M5 7h10l-2.5-2.5M15 13H5l2.5 2.5",
  skipBack: "M6 4v12M15 5l-7 5 7 5z",
  help:     "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM8 8a2 2 0 1 1 2.6 1.9c-.6.2-.6.6-.6 1.1M10 14h.01",
  settings: "M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M10 13v4",
  up:       "M5 12l5-5 5 5",
  down:     "M5 8l5 5 5-5",
  region:   "M4 5v10M16 5v10M7 10h6",
  dots:     "M10 4.5h.01M10 10h.01M10 15.5h.01",
  upload:   "M12 16V5M12 5l-4 4M12 5l4 4M5 16v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2",
  spinner:  "M8 2a6 6 0 1 1-6 6",
  refresh:  "M16 8a6 6 0 1 0-1.8 4.2M16 8v-4M16 8h-4",
};

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16 }: Props) {
  const filled = name === "play" || name === "pause";
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
