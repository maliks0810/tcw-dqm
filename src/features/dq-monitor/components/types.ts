export type ExceptionRow = {
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