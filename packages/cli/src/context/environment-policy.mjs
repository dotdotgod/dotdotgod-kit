const COMMON_FILTERED_NAMES = new Set(['NODE_OPTIONS', 'PYTHONPATH', 'RUBYOPT']);
const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function platformFamily(platform) {
  if (platform === 'win32') return 'win32';
  if (platform === 'darwin') return 'darwin';
  return 'posix';
}

function canonicalName(name, family) {
  return family === 'win32' ? name.toUpperCase() : name;
}

function validateName(name) {
  if (!VALID_NAME.test(name)) throw new TypeError(`Invalid environment variable name: ${JSON.stringify(name)}`);
}

function isFilteredName(name, family) {
  const comparable = family === 'win32' ? name.toUpperCase() : name;
  if (COMMON_FILTERED_NAMES.has(comparable)) return true;
  if (family === 'darwin') return comparable === 'LD_PRELOAD' || comparable.startsWith('DYLD_');
  if (family === 'posix') return comparable === 'LD_PRELOAD';
  return false;
}

function entriesOf(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right, 'en'));
}

/**
 * Compose a child-process environment without exposing filtered values.
 * Override values may be strings or null; null explicitly deletes a variable.
 */
export function composeEnvironment({ inherited = {}, overrides = {}, platform = process.platform, mode = 'inherit-filtered-v1', allow = [] } = {}) {
  const family = platformFamily(platform);
  if (!['inherit-filtered-v1', 'allowlist-v1'].includes(mode)) throw new TypeError(`Unsupported environment policy mode: ${mode}`);
  if (!Array.isArray(allow)) throw new TypeError('allow must be an array');
  const allowed = new Set(allow.map((name) => { validateName(name); return canonicalName(name, family); }));
  const env = {};
  const filtered = new Set();

  for (const [name, value] of entriesOf(inherited, 'inherited')) {
    validateName(name);
    if (typeof value !== 'string' && value !== undefined) {
      throw new TypeError(`Inherited environment variable ${name} must be a string or undefined`);
    }
    if (value === undefined) continue;
    const outputName = canonicalName(name, family);
    if (isFilteredName(outputName, family) || (mode === 'allowlist-v1' && !allowed.has(outputName))) {
      filtered.add(outputName);
      continue;
    }
    env[outputName] = value;
  }

  for (const [name, value] of entriesOf(overrides, 'overrides')) {
    validateName(name);
    const outputName = canonicalName(name, family);
    if (isFilteredName(outputName, family)) {
      throw new TypeError(`Environment variable ${name} is reserved by the execution policy`);
    }
    if (mode === 'allowlist-v1' && !allowed.has(outputName)) throw new TypeError(`Environment variable ${name} is not in the explicit allowlist`);
    if (value === null) {
      delete env[outputName];
      continue;
    }
    if (typeof value !== 'string') {
      throw new TypeError(`Environment override ${name} must be a string or null`);
    }
    env[outputName] = value;
  }

  return {
    env,
    policy: {
      mode,
      platform: family,
      ...(mode === 'allowlist-v1' ? { allowedNames: [...allowed].sort((left, right) => left.localeCompare(right, 'en')) } : {}),
      filteredNames: [...filtered].sort((left, right) => left.localeCompare(right, 'en')),
    },
  };
}
