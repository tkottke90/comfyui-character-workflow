/** TDK Input — single-line text input. Accepts all native input props. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Red border for validation errors */
  invalid?: boolean;
}
export declare function Input(props: InputProps): JSX.Element;