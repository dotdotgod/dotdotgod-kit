import { randomBytes } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync,
  renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { adapterError, DotdotgodServiceError } from './errors.mjs';
import { UNSAFE_PATH_CHARS } from './types.mjs';

const MAX_BYTES = 1024 * 1024;

function contains(root, path) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
}

function checkPath(path, runtime = true) {
  if (UNSAFE_PATH_CHARS.test(path)) throw adapterError('UNSAFE_PATH_CHARS', { runtime });
}

function io(target, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof DotdotgodServiceError) throw error;
    if (error.code === 'ELOOP') throw adapterError('SYMLINK_REJECTED', { target });
    throw adapterError('IO_ERROR', { target });
  }
}

function lstat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function createAdapterFs({ root, homeDir }) {
  checkPath(root);
  checkPath(homeDir);
  const boundary = resolve(root);
  const canonicalHome = io(homeDir, () => {
    try {
      return realpathSync(homeDir);
    } catch (error) {
      if (error.code === 'ENOENT') return homeDir;
      throw error;
    }
  });
  const protectedPaths = [homeDir, canonicalHome].map((home) => resolve(home, '.dotdotgod/config.json').toLowerCase());
  const isProtected = (path) => protectedPaths.some((config) => contains(config, path.toLowerCase()));

  function inspect(target, createDirs = false) {
    checkPath(target);
    const path = resolve(target);
    if (!contains(boundary, path) || isProtected(path)) {
      throw adapterError('PATH_OUTSIDE_ROOT', { target: path });
    }
    return io(path, () => {
      const anchor = parse(path).root;
      const parts = path.slice(anchor.length).split(sep).filter(Boolean);
      let current = anchor;
      let stat = lstat(anchor);
      let canonicalBoundary = boundary;
      for (const [i, part] of parts.entries()) {
        current = join(current, part);
        stat = lstat(current);
        if (!stat && createDirs) {
          mkdirSync(current, { mode: 0o700 });
          stat = lstatSync(current);
        }
        if (!stat) break;
        if (stat.isSymbolicLink()) throw adapterError('SYMLINK_REJECTED', { target: current });
        if ((createDirs || i < parts.length - 1) && !stat.isDirectory()) {
          throw adapterError('IO_ERROR', { target: current });
        }
        if (current === boundary) canonicalBoundary = realpathSync(current);
      }
      if (stat) {
        const canonical = realpathSync(path);
        if (!contains(canonicalBoundary, canonical) || isProtected(canonical)) {
          throw adapterError('PATH_OUTSIDE_ROOT', { target: path });
        }
      }
      return { path, stat };
    });
  }

  function read(target, { maxBytes = MAX_BYTES } = {}) {
    const { path, stat } = inspect(target);
    if (!stat) return null;
    return io(path, () => {
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.size > maxBytes) throw adapterError('IO_ERROR', { target: path });
        if (opened.dev !== stat.dev || opened.ino !== stat.ino) {
          throw adapterError('CONCURRENT_MODIFICATION', { target: path });
        }
        const bytes = Buffer.alloc(opened.size + 1);
        let count = 0;
        while (count < bytes.length) {
          const n = readSync(fd, bytes, count, bytes.length - count, null);
          if (n === 0) break;
          count += n;
        }
        if (count > opened.size) throw adapterError('CONCURRENT_MODIFICATION', { target: path });
        return bytes.subarray(0, count);
      } finally {
        closeSync(fd);
      }
    });
  }

  function assertSnapshot(path, expected, options) {
    const actual = read(path, options);
    if (actual === null ? expected !== null : !Buffer.isBuffer(expected) || !actual.equals(expected)) {
      throw adapterError('CONCURRENT_MODIFICATION', { target: path });
    }
  }

  function writeAtomic(target, bytes, expected, options) {
    const { path } = inspect(target);
    assertSnapshot(path, expected, options);
    inspect(dirname(path), true);
    const temp = join(dirname(path), `.${basename(path)}.${randomBytes(12).toString('hex')}.tmp`);
    io(path, () => {
      const fd = openSync(temp, 'wx', 0o600);
      let published = false;
      try {
        try {
          writeFileSync(fd, bytes);
        } finally {
          closeSync(fd);
        }
        // shortcut: check-to-rename is not a lock; revisit for parallel/daemon installs.
        assertSnapshot(path, expected, options);
        renameSync(temp, path);
        published = true;
      } finally {
        if (!published) unlinkSync(temp);
      }
    });
  }

  function removeFile(target, expected, options) {
    const { path } = inspect(target);
    assertSnapshot(path, expected, options);
    if (expected !== null) io(path, () => unlinkSync(path));
  }

  function removeEmptyDir(target) {
    const { path, stat } = inspect(target);
    if (!stat || path === boundary) return false;
    return io(path, () => {
      try {
        rmdirSync(path);
        return true;
      } catch (error) {
        if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') return false;
        throw error;
      }
    });
  }

  return { inspect, read, writeAtomic, removeFile, removeEmptyDir, mkdir: (path) => inspect(path, true) };
}

export function requireProjectRoot(root, { cwd, homeDir }) {
  if (typeof root !== 'string' || root === '') throw adapterError('INVALID_ROOT');
  checkPath(root, false);
  const path = resolve(cwd, root);
  const { stat } = createAdapterFs({ root: path, homeDir }).inspect(path);
  if (!stat?.isDirectory()) throw adapterError('INVALID_ROOT', { target: path });
  return io(path, () => realpathSync(path));
}
