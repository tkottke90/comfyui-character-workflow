/** TDK Badge — small status pill. */
export interface BadgeProps {
  tone?: 'neutral' | 'green' | 'blue' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;