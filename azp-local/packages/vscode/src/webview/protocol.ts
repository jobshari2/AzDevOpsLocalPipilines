// Messages between the extension and the graph webview. The webview receives data
// only through these messages and loads nothing remote (D12).
import type { GraphModel, Selection, SourceRef } from '@azp-local/core';

export interface StepSnapshot {
  id: string;
  displayName?: string;
  state: string;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
  errors: number;
  warnings: number;
}

export interface JobSnapshot {
  state: string;
  reused: boolean;
  image?: string;
  message?: string;
  container?: string;
  startedAt?: number;
  finishedAt?: number;
  steps: StepSnapshot[];
}

export interface RunSnapshot {
  runId: string;
  live: boolean;
  selection: string;
  result?: string;
  buildNumber?: string;
  startedAt?: number;
  finishedAt?: number;
  gaps: string[];
  jobs: Record<string, JobSnapshot>;
  tests: { jobId: string; title: string; total: number; passed: number; failed: number; skipped: number; durationMs: number; failures: string[] }[];
  coverage: { jobId: string; format: string; linesCovered: number; linesTotal: number; branchesCovered?: number; branchesTotal?: number }[];
  artifacts: { jobId: string; name: string; files: number; path: string }[];
  summaries: { jobId: string; name: string; path: string }[];
}

export type ToWebview =
  | { type: 'model'; graph: GraphModel; title: string; trusted: boolean; run?: RunSnapshot; focus?: string; stale?: boolean }
  | { type: 'run'; run?: RunSnapshot };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'source'; src: SourceRef }
  | { type: 'log'; jobId: string; stepId: string }
  | { type: 'run'; selection: Selection }
  | { type: 'cancel' }
  | { type: 'reveal'; path: string; kind: 'artifact' | 'summary' }
  | { type: 'shell'; jobId: string }
  | { type: 'command'; command: 'expand' | 'doctor' | 'setInputs' | 'rerunFailed' };
