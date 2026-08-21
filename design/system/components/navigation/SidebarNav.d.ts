/** TDK SidebarNav — green nav aside. Enforced 3-row flex-column structure: header (logo + title), navigation (page links, flex-grow — pushes the other rows to the edges), actions (secondary nav: settings, user avatar, toggles). */
export interface SidebarNavItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
}
export interface SidebarNavProps {
  brand?: string;
  logoSrc?: string;
  items: SidebarNavItem[];
  /** Links rendered in the bottom actions row (settings, account) — same style as items */
  actionItems?: SidebarNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Bottom actions row — secondary nav: settings, user chip, theme toggle */
  actions?: React.ReactNode;
  /** Legacy alias for actions */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function SidebarNav(props: SidebarNavProps): JSX.Element;