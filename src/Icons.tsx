import type { SVGProps } from "react";

type IconName =
  | "dashboard"
  | "students"
  | "guardians"
  | "wallet"
  | "payment"
  | "expense"
  | "report"
  | "settings"
  | "logout"
  | "search"
  | "plus"
  | "edit"
  | "trash"
  | "refresh"
  | "calendar"
  | "check"
  | "arrow-down"
  | "arrow-up"
  | "menu"
  |"eye"
  |"file-text";

type Props = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <>
    <rect x="3" y="3" width="8" height="8" rx="2"/>
    <rect x="13" y="3" width="8" height="5" rx="2"/>
    <rect x="13" y="10" width="8" height="11" rx="2"/>
    <rect x="3" y="13" width="8" height="8" rx="2"/>
  </>,
  students: <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="10" cy="7" r="4"/>
    <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </>,
  guardians: <>
    <circle cx="9" cy="8" r="4"/>
    <path d="M2 21v-2a7 7 0 0 1 14 0v2"/>
    <path d="M19 8v6M16 11h6"/>
  </>,
  wallet: <>
    <rect x="2" y="5" width="20" height="15" rx="3"/>
    <path d="M2 9h20M16 15h2"/>
    <path d="M5 5V3h14v2"/>
  </>,
  payment: <>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </>,
  expense: <>
    <path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5"/>
  </>,
  report: <>
    <path d="M3 3v18h18"/>
    <path d="m19 9-5 5-4-4-5 5"/>
  </>,
  settings: <>
    <circle cx="12" cy="12" r="3"/>
    <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z"/>
  </>,
  logout: <>
    <path d="M10 17l5-5-5-5M15 12H3"/>
    <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>
  </>,
  search: <>
    <circle cx="11" cy="11" r="7"/>
    <path d="m20 20-4-4"/>
  </>,
  plus: <path d="M12 5v14M5 12h14"/>,
  edit: <>
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
  </>,
  trash: <>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
    <path d="M10 11v5M14 11v5"/>
  </>,
  refresh: <>
    <path d="M20 7v5h-5M4 17v-5h5"/>
    <path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/>
  </>,
  calendar: <>
    <rect x="3" y="5" width="18" height="16" rx="2"/>
    <path d="M16 3v4M8 3v4M3 10h18"/>
  </>,
  check: <path d="m5 12 4 4L19 6"/>,
  "arrow-down": <path d="M12 5v14m-7-7 7 7 7-7"/>,
  "arrow-up": <path d="M12 19V5m-7 7 7-7 7 7"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,

  eye: <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
    <circle cx="12" cy="12" r="3"/>
  </>,

  "file-text": <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
    <path d="M14 2v6h6M8 13h8M8 17h8"/>
  </>
};

export default function Icon({
  name,
  size = 20,
  ...props
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}