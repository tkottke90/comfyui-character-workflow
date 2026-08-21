/** TDK ChatBubble — structured chat message: time row, colored content, actions/metrics row; supports file, image (with NSFW blur), and audio attachments. */
export interface ChatImage {
  src: string;
  alt?: string;
  /** Blur the image behind an explicit reveal toggle */
  nsfw?: boolean;
}
export interface ChatAudio {
  /** Real audio URL; omit for a visual mock */
  src?: string;
  name?: string;
  /** Display duration, e.g. "0:42" */
  duration?: string;
}
export interface ChatFile {
  name: string;
  /** Display size, e.g. "1.2 MB" */
  size?: string;
}
export interface ChatMetrics {
  /** Execution time, e.g. "1.24s" */
  time?: string;
  /** Tokens per second, e.g. "38 tok/s" */
  tps?: string;
  /** Generation cost, e.g. "$0.003" */
  cost?: string;
}
export interface ChatToolCallProps {
  /** Tool name, e.g. "get_weather" */
  name: string;
  /** Input summary shown inline, e.g. '{ "zip": "97210" }' */
  input?: string;
  /** Result text revealed when the row is expanded */
  result?: string;
  status?: 'done' | 'running' | 'error';
  /** Display duration, e.g. "0.31s" */
  duration?: string;
  style?: React.CSSProperties;
}
/** Collapsible tool-call row for AI messages — place inline in ChatBubble children, in chronological call order. */
export declare function ChatToolCall(props: ChatToolCallProps): JSX.Element;
export interface ChatBubbleProps {
  /** self = outgoing (green, right, time top-left); other/ai = incoming (left, time top-right) */
  from?: 'self' | 'other' | 'ai';
  author?: React.ReactNode;
  /** Date | ms | ISO string — renders relative when today ("5 mins ago"), locale date/time otherwise */
  timestamp?: Date | number | string;
  /** Pre-formatted time string (fallback if timestamp is omitted) */
  time?: string;
  /** Icon buttons in the bottom-right cell (copy, like/dislike) */
  actions?: React.ReactNode;
  /** AI only — bottom-left mono metrics row */
  metrics?: ChatMetrics;
  /** Inline images inside the content */
  images?: ChatImage[];
  /** Audio row at the bottom of the content */
  audio?: ChatAudio;
  /** File chip at the top of the content (single) */
  file?: ChatFile;
  /** Multiple file chips at the top of the content; takes precedence over file */
  files?: ChatFile[];
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function ChatBubble(props: ChatBubbleProps): JSX.Element;
/** Formats a timestamp the ChatBubble way: relative if today, locale date/time otherwise. */
export declare function formatChatTime(t: Date | number | string): string;
export interface ComposerAttachment {
  kind: 'image' | 'file';
  name?: string;
  /** Preview URL (images) */
  src?: string;
  /** Display size, e.g. "1.2 MB" */
  size?: string;
}
export interface ChatComposerProps {
  value: string;
  onChange?: (value: string) => void;
  /** Called with the trimmed text and current attachments; attachments clear after send */
  onSend?: (value: string, attachments: ComposerAttachment[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Controlled attachment list (top row); uncontrolled internally when omitted */
  attachments?: ComposerAttachment[];
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
  /** Selected LLM model shown in the chip, e.g. "claude-sonnet-4.5" */
  model?: string;
  onModelChange?: (model: string) => void;
  /** Provider → models map for the nested + menu (default: OpenAI, Anthropic) */
  providers?: Record<string, string[]>;
  style?: React.CSSProperties;
}
/** Two-row composer: attachment previews (hover × to remove), message textarea, then + menu (Add a file / Provider › models), model chip, and send. Enter sends, Shift+Enter breaks. */
export declare function ChatComposer(props: ChatComposerProps): JSX.Element;