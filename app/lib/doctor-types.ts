export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export type CategoryId = "discovery" | "protocol" | "accessibility";

export type IssueSeverity = "error" | "warning";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  data?: unknown;
}

export interface EndpointResult {
  path: string;
  method: string;
  summary?: string;
  fullUrl: string;
  checks: CheckResult[];
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  description: string;
  weight: number;
  score: number;
  grade: string;
}

export interface DoctorIssue {
  id: string;
  category: CategoryId;
  severity: IssueSeverity;
  title: string;
  detail: string;
  fix: string;
  checkId: string;
  endpoint?: {
    method: string;
    path: string;
    fullUrl: string;
  };
}

export interface DoctorScanResult {
  url: string;
  baseChecks: CheckResult[];
  specTitle?: string;
  totalEndpoints: number;
  endpoints: EndpointResult[];
  testedAt: string;
}

export interface CheckResponse extends DoctorScanResult {
  score: number;
  grade: string;
  categories: CategoryScore[];
  issues: DoctorIssue[];
  doctorPrompt: string;
}
