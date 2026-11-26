import { ADAPTER_SCHEMA_VERSION } from './types.mjs';

const ARGUMENT_ERRORS = {
  INVALID_ARGUMENT: 'Invalid adapter argument.',
  INVALID_HOST: 'Unknown adapter host.',
  INVALID_SCOPE: 'Invalid scope for this adapter.',
  INVALID_ROOT: 'The project root must be an existing directory.',
  PI_REQUIRES_WITH_SKILLS: 'Pi only supports optional skill installation.',
  OBSIDIAN_UNSUPPORTED: 'Obsidian does not use the adapter installer.',
  UNSAFE_PATH_CHARS: 'A path contains control characters.',
};

const OPERATION_ERRORS = {
  NODE_VERSION_UNSUPPORTED: 'Node.js 22.5.0 or later is required.',
  SQLITE_UNAVAILABLE: 'The selected Node.js runtime cannot load node:sqlite.',
  EPHEMERAL_RUNTIME_PATH: 'The selected runtime is in a temporary cache.',
  PATH_CLI_NOT_FOUND: 'No executable dotdotgod was found on PATH.',
  PATH_CLI_INCOMPATIBLE: 'The dotdotgod on PATH did not pass the Node.js and SQLite checks.',
  SYMLINK_REJECTED: 'An adapter path contains a symbolic link.',
  PATH_OUTSIDE_ROOT: 'This path is outside the permitted adapter files.',
  UNMANAGED_CONFLICT: 'An unmanaged adapter target already exists.',
  MODIFIED_CONFLICT: 'Managed adapter files were changed locally.',
  LEGACY_COEXIST_CONFLICT: 'Remove the legacy adapter before continuing.',
  SKILL_CONFLICT: 'An unmanaged skill directory already exists.',
  CONFIG_PARSE_ERROR: 'An adapter configuration or ownership marker is invalid.',
  CONFIG_KEY_CONFLICT: 'The shared configuration contains a conflicting key.',
  CONCURRENT_MODIFICATION: 'The file changed since preflight; retry after inspecting it.',
  CODEX_VERSION_MISMATCH: 'Codex CLI 0.163.0 is required.',
  CODEX_CONFIG_CONFLICT: 'The Codex configuration contains a conflicting setting.',
  CODEX_PLAN_EXISTS: 'The Codex plan profile already exists.',
  IO_ERROR: 'An adapter file could not be accessed safely.',
};

// Only pass known paths and constructed recovery commands here, never file contents or caught errors.
export class DotdotgodServiceError extends Error {
  constructor(code, { target, affectedPaths, recovery = [], runtime = false } = {}) {
    const argument = Object.hasOwn(ARGUMENT_ERRORS, code);
    const known = argument || Object.hasOwn(OPERATION_ERRORS, code);
    if (!known) code = 'IO_ERROR';
    const detail = argument ? ARGUMENT_ERRORS[code] : OPERATION_ERRORS[code];
    super(detail);
    this.name = 'DotdotgodServiceError';
    this.code = code;
    this.exitCode = argument && !(runtime && code === 'UNSAFE_PATH_CHARS') ? 2 : 1;
    this.details = {
      ...(typeof target === 'string' && { target }),
      detail,
      ...(Array.isArray(affectedPaths) && { affectedPaths: affectedPaths.filter((item) => typeof item === 'string') }),
      recovery: recovery.map(({ argv, comment }) => ({
        ...(typeof comment === 'string' && { comment }),
        argv: argv.filter((item) => typeof item === 'string'),
      })),
    };
  }
}

export function adapterError(code, options) {
  return new DotdotgodServiceError(code, options);
}

export function formatAdapterError(command, host, error) {
  const safe = error instanceof DotdotgodServiceError ? error : adapterError('IO_ERROR');
  const { target, detail, affectedPaths, recovery } = safe.details;
  return {
    schemaVersion: ADAPTER_SCHEMA_VERSION, ok: false, command, ...(host !== undefined && { host }),
    error: {
      code: safe.code,
      ...(target !== undefined && { target }),
      detail,
      ...(affectedPaths !== undefined && { affectedPaths }),
      recovery,
    },
  };
}
