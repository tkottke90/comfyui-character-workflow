/** TDK IconButton — square icon-only button; requires accessible label. */
export interface IconButtonProps {
  /** Accessible name (aria-label + tooltip) */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'primary' | 'outline';
  disabled?: boolean;
  onClick?: () => void;
  /** The icon element (Lucide SVG) */
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;