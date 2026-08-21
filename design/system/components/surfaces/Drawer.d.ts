/** TDK Drawer — native <dialog> side panel: slides in from left/right with ease-out, slides out on dismiss; blurred #222/33% backdrop matching Dialog. */
export interface DrawerProps {
  open: boolean;
  /** Edge the drawer enters from (default "right") */
  side?: 'left' | 'right';
  title: React.ReactNode;
  /** Called on close button, backdrop click, or Esc */
  onClose: () => void;
  /** Optional footer actions, ordered right-to-left (first child renders rightmost) */
  actions?: React.ReactNode;
  /** Panel width in px (default 360) */
  width?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Drawer(props: DrawerProps): JSX.Element;
