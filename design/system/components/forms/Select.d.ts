/** TDK Select — native dropdown with brand chevron. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Options as strings or {value, label} pairs */
  options?: (string | { value: string; label: string })[];
  invalid?: boolean;
}
export declare function Select(props: SelectProps): JSX.Element;