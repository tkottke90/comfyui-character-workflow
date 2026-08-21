/** TDK Dialog — native <dialog> modal: title | close grid header, content, right-to-left actions row; blurred #222/33% backdrop. */
export interface DialogProps {
  open: boolean;
  title: React.ReactNode;
  /** Called on close button, backdrop click, or Esc */
  onClose: () => void;
  /** Action buttons, ordered right-to-left (first child renders rightmost) */
  actions?: React.ReactNode;
  /** Legacy alias: renders left-to-right, right-aligned */
  footer?: React.ReactNode;
  /** Max width in px (default 440) */
  width?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Dialog(props: DialogProps): JSX.Element;