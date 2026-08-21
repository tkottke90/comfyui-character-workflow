/** TDK Textarea — multi-line text input. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  rows?: number;
}
export declare function Textarea(props: TextareaProps): JSX.Element;