export interface LogEntry {
  id: string;
  date: string;
  time: string;
  timestamp: number;
  url: string;
  text: string;
  field?: FieldInfo;
}

export interface FieldInfo {
  /** The most descriptive identifier: label text > name > placeholder > type */
  label: string;
  /** Input type attribute (text, password, email, etc.) */
  type: string;
  /** Name attribute */
  name?: string;
  /** Placeholder attribute */
  placeholder?: string;
  /** ID attribute */
  id?: string;
  /** Whether field is a password type */
  isPassword: boolean;
}

export type ExtensionMessage =
  | { type: 'UPSERT_LOG'; entry: LogEntry }
  | { type: 'GET_LOGS'; date?: string; limit?: number }
  | { type: 'DELETE_DATE'; date: string }
  | { type: 'DELETE_ALL' }
  | { type: 'SEND_LOGS_NOW' };
