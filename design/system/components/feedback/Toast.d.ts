/** TDK Toast — bottom-right notification with tone accent edge. */
export interface ToastProps {
  tone?: 'success' | 'info' | 'warning' | 'danger';
  title: React.ReactNode;
  message?: React.ReactNode;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
export interface ToastStackProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}
/** Fixed bottom-right container that stacks Toasts */
export declare function ToastStack(props: ToastStackProps): JSX.Element;