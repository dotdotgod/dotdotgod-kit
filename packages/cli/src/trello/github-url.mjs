import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function normalizeGitHubRepositoryKey(value = '') {
  const text = String(value).trim();
  const match = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

export function normalizeGitHubRemote(value = '') {
  const text = String(value).trim();
  if (!text) return null;
  let match = text.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u);
  if (match) return { repositoryUrl: `https://github.com/${match[1]}/${match[2]}`, repositoryKey: `${match[1]}/${match[2]}` };
  match = text.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/u);
  if (match) return { repositoryUrl: `https://github.com/${match[1]}/${match[2]}`, repositoryKey: `${match[1]}/${match[2]}` };
  return null;
}

function encodePath(path = '') {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function repositoryFromPackage(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    return normalizeGitHubRemote(String(raw ?? '').replace(/^git\+/, ''));
  } catch {
    return null;
  }
}

function gitValue(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function repositoryResult(repositoryUrl, repositoryKey, source, warnings = []) {
  return { ok: true, repositoryUrl, repositoryKey, source, warnings, errors: [] };
}

export function resolveGitHubRepositoryIdentity({ root = '.', repository, repositoryUrl, remoteUrl, env = process.env, git = true, mode = 'dry-run' } = {}) {
  const warnings = [];
  const explicitKey = normalizeGitHubRepositoryKey(repository);
  if (explicitKey) return repositoryResult(`https://github.com/${explicitKey}`, explicitKey, 'explicit-repository', warnings);

  const explicitRemote = normalizeGitHubRemote(repositoryUrl);
  if (explicitRemote) return repositoryResult(explicitRemote.repositoryUrl, explicitRemote.repositoryKey, 'explicit-repository-url', warnings);

  const actionsKey = normalizeGitHubRepositoryKey(env?.GITHUB_REPOSITORY);
  if (actionsKey) return repositoryResult(`https://github.com/${actionsKey}`, actionsKey, 'github-actions', warnings);
  if (mode === 'write' && env?.GITHUB_REPOSITORY && !actionsKey) {
    return { ok: false, repositoryUrl: '', repositoryKey: '', source: '', warnings, errors: [{ code: 'GITHUB_REPOSITORY_KEY_INVALID', message: 'Could not resolve a valid GitHub repository key from GITHUB_REPOSITORY. Fix: run the trusted workflow with GITHUB_REPOSITORY in owner/name form, then retry sync.' }] };
  }

  const injectedRemote = normalizeGitHubRemote(remoteUrl);
  if (injectedRemote) {
    warnings.push({ code: 'GITHUB_URL_REMOTE_FALLBACK', message: 'GitHub URL resolved from injected git remote fallback.' });
    return repositoryResult(injectedRemote.repositoryUrl, injectedRemote.repositoryKey, 'remote-url', warnings);
  }

  if (mode !== 'write') {
    const packageRepo = repositoryFromPackage(root);
    if (packageRepo) {
      warnings.push({ code: 'GITHUB_URL_PACKAGE_FALLBACK', message: 'GitHub URL resolved from package repository metadata.' });
      return repositoryResult(packageRepo.repositoryUrl, packageRepo.repositoryKey, 'package', warnings);
    }
    if (git) {
      const remote = gitValue(root, ['remote', 'get-url', 'origin']);
      const gitRepo = normalizeGitHubRemote(remote);
      if (gitRepo) {
        warnings.push({ code: 'GITHUB_URL_GIT_REMOTE_FALLBACK', message: 'GitHub URL resolved from local git origin remote.' });
        return repositoryResult(gitRepo.repositoryUrl, gitRepo.repositoryKey, 'git-remote', warnings);
      }
    }
  }

  const code = mode === 'write' ? 'GITHUB_REPOSITORY_KEY_UNRESOLVED' : 'GITHUB_URL_UNRESOLVED_REPOSITORY';
  const message = mode === 'write'
    ? 'Could not resolve a trusted GitHub repository key for Trello custom field entry. Fix: run write mode from GitHub Actions with GITHUB_REPOSITORY or provide explicit GitHub repository metadata, then retry sync.'
    : 'Could not resolve a GitHub repository URL.';
  return { ok: false, repositoryUrl: '', repositoryKey: '', source: '', warnings, errors: [{ code, message }] };
}

export function resolveGitHubFileUrl({ root = '.', file, repository, repositoryUrl, branch, remoteUrl, env = process.env, git = true, mode = 'dry-run' } = {}) {
  const identity = resolveGitHubRepositoryIdentity({ root, repository, repositoryUrl, remoteUrl, env, git, mode });
  const warnings = [...(identity.warnings ?? [])];
  let resolvedBranch = branch;
  if (!resolvedBranch && mode === 'write') {
    if (env?.GITHUB_REF_NAME) resolvedBranch = env.GITHUB_REF_NAME;
    else if (typeof env?.GITHUB_REF === 'string' && env.GITHUB_REF.startsWith('refs/heads/')) resolvedBranch = env.GITHUB_REF.slice('refs/heads/'.length);
    else if (env?.GITHUB_DEFAULT_BRANCH) resolvedBranch = env.GITHUB_DEFAULT_BRANCH;
  }
  if (!resolvedBranch && git && mode !== 'write') {
    resolvedBranch = gitValue(root, ['branch', '--show-current']);
    if (resolvedBranch) warnings.push({ code: 'GITHUB_URL_GIT_BRANCH_FALLBACK', message: 'GitHub branch resolved from local git state.' });
  }
  const errors = [];
  if (!identity.ok) errors.push(...identity.errors);
  if (!resolvedBranch) errors.push({ code: 'GITHUB_URL_UNRESOLVED_BRANCH', message: 'Could not resolve a GitHub branch.' });
  if (errors.length > 0) return { ok: false, url: '', repositoryKey: identity.repositoryKey ?? '', repositoryUrl: identity.repositoryUrl ?? '', warnings, errors };
  return { ok: true, url: `${identity.repositoryUrl}/blob/${encodeURIComponent(resolvedBranch)}/${encodePath(file)}`, repositoryKey: identity.repositoryKey, repositoryUrl: identity.repositoryUrl, warnings, errors: [] };
}
