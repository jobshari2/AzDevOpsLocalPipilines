// checkout, publish and download: the steps that move files in and out of a job.
import * as fs from 'node:fs';
import * as path from 'node:path';
import picomatch from 'picomatch';
import type { StepContext, StepOutcome } from '../context';
import { listDirectory, listWorkspaceFiles } from '../workspace';

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export async function checkout(ctx: StepContext, repository: string): Promise<StepOutcome> {
  const { backend, io } = ctx;
  if (repository === 'none') {
    ctx.log('Checkout is disabled for this job (checkout: none). The sources directory is empty.');
    return { result: 'succeeded' };
  }

  let root = io.workspaceRoot;
  if (repository !== 'self') {
    const mapped = Object.entries(io.config.repositories).find(([alias]) => alias.toLowerCase() === repository.toLowerCase())?.[1];
    if (!mapped) {
      return {
        result: 'unsupported',
        message: `Repository '${repository}' is not mapped to a local folder. Add it under 'repositories:' in .azp-local.yml.`,
      };
    }
    root = path.resolve(io.workspaceRoot, mapped);
  }

  // With several checkout steps each repository gets its own folder under the sources directory, as on Azure.
  const many = ctx.job.steps.filter((s) => s.run.kind === 'checkout' && s.run.repository !== 'none').length > 1;
  const dest = many ? backend.p.join(backend.paths.sources, path.basename(root)) : backend.paths.sources;

  if (io.config.workspace === 'mount' && repository === 'self' && backend.kind === 'container' && !many) {
    ctx.log(`The workspace ${root} is mounted at ${dest}. Steps change your working tree directly, and ignored files are visible to them.`);
    return { result: 'succeeded' };
  }

  const listing = await listWorkspaceFiles(root);
  const bytes = listing.files.reduce((sum, file) => {
    try {
      return sum + fs.statSync(file.abs).size;
    } catch {
      return sum;
    }
  }, 0);
  ctx.log(`Copying ${listing.files.length} files (${megabytes(bytes)}) from ${root}`);
  ctx.log(
    listing.source === 'git'
      ? 'Source: files git tracks plus untracked files that are not ignored, with history.'
      : 'Source: every file not matched by a .gitignore (this folder is not a git repository).',
  );
  if (listing.normaliseEol) ctx.log('Line endings are converted to LF, as git would store them (core.autocrlf is on).');
  await backend.copyIn(listing.files, dest, listing.normaliseEol && backend.kind === 'container');
  ctx.log(`Checked out to ${dest}`);
  return { result: 'succeeded' };
}

export async function publish(ctx: StepContext, sourcePath: string, artifactName: string): Promise<StepOutcome> {
  const { backend, io } = ctx;
  const name = artifactName || ctx.job.name;
  const src = ctx.resolve(sourcePath || backend.paths.artifacts);
  const dest = path.join(io.runDir, 'artifacts', name);
  if (fs.existsSync(dest)) {
    return { result: 'failed', message: `Artifact '${name}' already exists in this run. Artifact names must be unique.` };
  }
  const copied = await backend.copyOut(src, dest);
  if (!copied) return { result: 'failed', message: `Path does not exist: ${src}` };
  if (copied.skippedLinks > 0) ctx.warn(`${copied.skippedLinks} symbolic link(s) in ${src} were not copied into the artifact.`);
  ctx.log(`Published artifact '${name}': ${copied.files} file(s) from ${src}`);
  ctx.log(`Stored at ${dest}`);
  ctx.emit({ type: 'artifact', jobId: ctx.job.id, name, path: dest, files: copied.files });
  return { result: 'succeeded' };
}

export async function download(
  ctx: StepContext,
  opts: { source: string; artifact: string; targetPath?: string; patterns?: string; shortcut: boolean },
): Promise<StepOutcome> {
  const { backend } = ctx;
  if (opts.source === 'none') {
    ctx.log('Artifact download is disabled (download: none).');
    return { result: 'succeeded' };
  }
  if (opts.source !== 'current' && opts.source !== '') {
    return { result: 'unsupported', message: `Artifacts of pipeline resource '${opts.source}' live in Azure DevOps and cannot be downloaded locally.` };
  }
  const names = opts.artifact ? [opts.artifact] : ctx.listArtifacts();
  if (names.length === 0) {
    ctx.log('No artifacts have been published in this run.');
    return { result: 'succeeded' };
  }
  const base = opts.targetPath ? ctx.resolve(opts.targetPath) : backend.paths.workspace;
  const patterns = (opts.patterns ?? '**').split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  const matches = picomatch(patterns.filter((p) => !p.startsWith('!')), { dot: true, ignore: patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1)) });

  for (const name of names) {
    const dir = ctx.findArtifact(name);
    if (!dir) {
      return { result: 'failed', message: `Artifact '${name}' was not found. The job that publishes it has not run, or did not get that far.` };
    }
    // `download:` always uses a folder per artifact; the task puts a single named artifact straight into its target.
    const dest = opts.shortcut || names.length > 1 ? backend.p.join(base, name) : base;
    const files = listDirectory(dir).filter((file) => matches(file.rel));
    await backend.copyIn(files, dest);
    ctx.log(`Downloaded artifact '${name}': ${files.length} file(s) to ${dest}`);
  }
  return { result: 'succeeded' };
}
