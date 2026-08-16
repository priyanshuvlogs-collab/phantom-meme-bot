export interface SafetyCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Human-readable measured value, e.g. "$154,203" or "revoked". */
  value: string;
  detail?: string;
}

export interface SafetyReport {
  mint: string;
  symbol: string;
  name: string;
  passed: boolean;
  checks: SafetyCheck[];
  checkedAt: number;
}
