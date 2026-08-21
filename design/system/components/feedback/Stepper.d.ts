/** TDK Stepper — numbered-step progress tracker for multi-step flows. */
export interface StepperProps {
  /** Step labels in order */
  steps: string[];
  /** 0-based index of the active step */
  current?: number;
  style?: React.CSSProperties;
}
export declare function Stepper(props: StepperProps): JSX.Element;