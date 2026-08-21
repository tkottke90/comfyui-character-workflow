/** TDK Tabs — enclosed (bordered) tab strip with green active indicator. */
export interface TabsProps {
  tabs: React.ReactNode[];
  /** 0-based active index */
  active?: number;
  onChange?: (index: number) => void;
  style?: React.CSSProperties;
}
export declare function Tabs(props: TabsProps): JSX.Element;