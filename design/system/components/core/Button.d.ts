/** TDK Button — primary action element.
 * @startingPoint section="Core" subtitle="Raised, outlined and text buttons in three tones" viewport="700x360"
 */
export interface ButtonProps {
  /** Fill style: raised (solid + shadow), outlined (border), text (no chrome). Legacy values primary/secondary/ghost/danger still map. */
  variant?: 'raised' | 'outlined' | 'text' | 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Color role: primary (apple green), secondary (steel blue), warning (chestnut rose) */
  tone?: 'primary' | 'secondary' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  /** Label; prepend an inline Lucide SVG for an icon button */
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;