export type ExceptionRow = {
  exceptionId: number;
  dateTime: string;
  priority: string;
  ruleName: string;
  issue: string;
  aladdin: string;
  idBbGlobal: string;
  vendor: string;
  action: string;
  comments: string;
  state: string;
  status: string;
  // DM_USER.USER string resolved from EXCEPTION.ASSIGN_TO_ID, or "" when
  // unassigned. Rendered as an editable <select> in the ASSIGN TO column
  // when RULE_GROUP.FLAG_ASSIGN_TO_VISIBLE is true for the current group.
  assignTo: string;
  // ISO YYYY-MM-DD (from EXCEPTION.SUPPRESS_DATE), or "" when unset.
  // Rendered as an <input type="date"> in the editable SUPPRESS_DATE column
  // when RULE_GROUP.FLAG_SUPPRESS_DATE is true for the current group.
  suppressDate: string;
  // ISO YYYY-MM-DD (from EXCEPTION.OPEN_DATE), or "" when unset — the
  // most recent date the row was in status 'New'. Rendered read-only at
  // the end of the grid for Security-Master-family rule groups.
  openDate: string;
  // ISO YYYY-MM-DD (from EXCEPTION.CLOSE_DATE), or "" when unset — the
  // most recent date the row moved to Accept / Research. Rendered
  // read-only alongside openDate.
  closeDate: string;
  // Parsed RESULT_DATA: every column from the rule's RULE_CATALOG_SOURCE row.
  // Keyed by column name as the rule SELECT emitted it. Undefined when the
  // exception's RESULT_DATA was null or didn't parse as a JSON object.
  resultData?: Record<string, unknown>;
};

export type SecurityRow = {
  dateTime: string;
  priority: string;
  severity: string;
  type: string;
  assignTo: string;
  aladdinId: string;
  figi: string;
  securityDescription: string;
  trader: string;
  tradingTeam: string;
  exceptionCount: number;
  bbgLastRefresh: string;
  triggerBbg: boolean;
  allComplete: boolean;
  exceptions: ExceptionRow[];
};