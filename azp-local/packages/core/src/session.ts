// Starts a plan on an engine and tees its events to the run store and to a listener.
import type { RunStore } from './runstore';
import type { Engine, JobResult, LocalConfig, RunEvent, RunPlan } from './types';

export interface HostHooks {
  getSecret(name: string, group?: string): Promise<string | undefined>;
  confirm(message: string): Promise<boolean>;
}

export interface RunSession {
  runId: string;
  runDir: string;
  cancel(): Promise<void>;
  done: Promise<{ result: JobResult; gaps: string[] }>;
}

export function startRun(args: {
  engine: Engine;
  plan: RunPlan;
  store: RunStore;
  workspaceRoot: string;
  config: LocalConfig;
  hooks: HostHooks;
  onEvent?: (event: RunEvent) => void;
}): RunSession {
  const { engine, plan, store } = args;
  const { runId, runDir } = store.createRun(plan, engine.id);
  const handle = engine.start(plan, {
    runId,
    runDir,
    workspaceRoot: args.workspaceRoot,
    config: args.config,
    getSecret: args.hooks.getSecret,
    confirm: args.hooks.confirm,
    resolveRunDir: (id) => store.runDir(id),
  });

  const done = (async () => {
    let outcome: { result: JobResult; gaps: string[] } = { result: 'failed', gaps: [] };
    for await (const event of handle.events) {
      store.append(runId, event);
      try {
        args.onEvent?.(event);
      } catch {
        /* a view failing must not stop the run being recorded */
      }
      if (event.type === 'run.finished') outcome = { result: event.result, gaps: event.gaps };
    }
    return outcome;
  })();

  return { runId, runDir, cancel: () => handle.cancel(), done };
}
