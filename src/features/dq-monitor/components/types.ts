export type ExceptionRow = {
  dateTime: string;
  priority: string;
  ruleName: string;
  issue: string;
  aladdin: string;
  vendor: string;
  action: string;
  comments: string;
  status: string;
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