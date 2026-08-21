/** TDK Field — label-above wrapper for any form control. */
export interface FieldProps {
  label: string;
  /** Helper text below the control */
  hint?: string;
  /** Error message; replaces hint and turns red */
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Field(props: FieldProps): JSX.Element;