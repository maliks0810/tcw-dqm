export type ExceptionRow = {
  dateTime: string;
  priority: string;
  ruleName: string;
  issue: string;
  aladdin: string;
  vendor: string;
  action: string;
  comments: string;
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
  exceptions: ExceptionRow[];
};