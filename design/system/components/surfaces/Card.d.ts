/** TDK Card — bordered white surface with crisp subtle shadow. */
export interface CardProps {
  /** Optional header title (adds a divided header row) */
  title?: React.ReactNode;
  /** Header-right actions (buttons, badges) */
  actions?: React.ReactNode;
  /** Full-bleed cover image URL rendered above the content */
  image?: string;
  imageAlt?: string;
  /** Cover image height in px (default 160) */
  imageHeight?: number;
  /** Default true; false for full-bleed content */
  padded?: boolean;
  /** Slightly stronger shadow */
  raised?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;