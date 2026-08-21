/** TDK ProgressBar — determinate progress with optional label and percent. */
export interface ProgressBarProps {
  value?: number;
  max?: number;
  label?: React.ReactNode;
  /** Show percent (mono) at right */
  showValue?: boolean;
  tone?: 'green' | 'blue';
  style?: React.CSSProperties;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;