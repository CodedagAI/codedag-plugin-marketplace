// Generates the Claude Code and Codex marketplace manifests from catalog/*.yaml.
//
// Usage: node scripts/generate-marketplaces.mjs [--check] [--root <dir>]
//
// --check compares the generated manifests with the files on disk and exits 1
// when any of them is missing or out of date, without writing.
// --root defaults to the repository that contains this script.

import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';

const MARKETPLACE_NAME = 'codedag';
const CLAUDE_MARKETPLACE_DESCRIPTION = 'CodeDAG plugin marketplace for Claude Code and Codex.';
const CLAUDE_OWNER_NAME = 'CodeDAG';
const CODEX_DISPLAY_NAME = 'CodeDAG';

const CATALOG_DIR = 'catalog';
const CLAUDE_MARKETPLACE_PATH = '.claude-plugin/marketplace.json';
const CODEX_MARKETPLACE_PATH = '.agents/plugins/marketplace.json';
const PLUGIN_MANIFEST_PATHS = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];

const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
// Codex uses the version as a cache directory name.
const PLUGIN_VERSION_PATTERN = /^[A-Za-z0-9.+_-]+$/;
const INSTALLATION_POLICIES = ['NOT_AVAILABLE', 'AVAILABLE', 'INSTALLED_BY_DEFAULT'];
const AUTHENTICATION_POLICIES = ['ON_INSTALL', 'ON_USE'];

const USAGE = 'Usage: node scripts/generate-marketplaces.mjs [--check] [--root <dir>]';

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function compareStrings(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Reports unknown and missing keys. Returns false when value is not a mapping.
function checkKeys(value, keys, label, errors) {
  if (!isMapping(value)) {
    errors.push(`${label} must be a mapping`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(`${label} has unknown key "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(`${label} is missing "${key}"`);
  }
  return true;
}

function checkEnum(value, allowed, label, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${label} must be one of ${allowed.join(', ')}`);
  }
}

// Returns the catalog entry, or null when it is invalid.
function readCatalogEntry(raw, label, errors) {
  const errorCount = errors.length;
  if (!checkKeys(raw, ['name', 'path', 'claude', 'codex'], label, errors)) return null;

  const { name, path: pluginPath, claude, codex } = raw;
  if (typeof name !== 'string' || !PLUGIN_NAME_PATTERN.test(name)) {
    errors.push(`${label}.name must match ${PLUGIN_NAME_PATTERN}`);
  } else if (pluginPath !== `./plugins/${name}`) {
    errors.push(`${label}.path must be ./plugins/${name}`);
  }

  if (checkKeys(claude, ['description'], `${label}.claude`, errors) && !isNonEmptyString(claude.description)) {
    errors.push(`${label}.claude.description must be a non-empty string`);
  }

  if (checkKeys(codex, ['category', 'policy'], `${label}.codex`, errors)) {
    if (!isNonEmptyString(codex.category)) {
      errors.push(`${label}.codex.category must be a non-empty string`);
    }
    const policyLabel = `${label}.codex.policy`;
    if (checkKeys(codex.policy, ['installation', 'authentication'], policyLabel, errors)) {
      checkEnum(codex.policy.installation, INSTALLATION_POLICIES, `${policyLabel}.installation`, errors);
      checkEnum(codex.policy.authentication, AUTHENTICATION_POLICIES, `${policyLabel}.authentication`, errors);
    }
  }

  return errors.length === errorCount ? raw : null;
}

async function readCatalog(root, errors) {
  let dirents;
  try {
    dirents = await readdir(path.join(root, CATALOG_DIR), { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    errors.push(`${CATALOG_DIR}/ is not a directory`);
    return [];
  }

  const files = dirents
    .filter((dirent) => dirent.name.endsWith('.yaml'))
    .sort((a, b) => compareStrings(a.name, b.name));
  if (files.length === 0) {
    errors.push(`${CATALOG_DIR}/ has no .yaml files`);
    return [];
  }

  const entries = [];
  const definedIn = new Map();
  for (const dirent of files) {
    const file = `${CATALOG_DIR}/${dirent.name}`;
    if (!dirent.isFile()) {
      errors.push(`${file} is not a regular file`);
      continue;
    }

    let catalog;
    try {
      catalog = parseYaml(await readFile(path.join(root, file), 'utf8'));
    } catch (error) {
      errors.push(`${file} is not valid YAML: ${error.message}`);
      continue;
    }
    if (!checkKeys(catalog, ['plugins'], file, errors)) continue;
    if (!Array.isArray(catalog.plugins) || catalog.plugins.length === 0) {
      errors.push(`${file}: plugins must be a non-empty list`);
      continue;
    }

    catalog.plugins.forEach((raw, index) => {
      const entry = readCatalogEntry(raw, `${file}: plugins[${index}]`, errors);
      if (!entry) return;
      if (definedIn.has(entry.name)) {
        errors.push(`${file}: plugin "${entry.name}" is already defined in ${definedIn.get(entry.name)}`);
        return;
      }
      definedIn.set(entry.name, file);
      entries.push(entry);
    });
  }
  return entries;
}

// Checks that relPath under root has the expected type and that neither it nor any
// ancestor below root is a symbolic link. A missing path is accepted when optional.
// Returns true when the path exists and passes the check.
async function checkRealPath(root, relPath, type, errors, { optional = false } = {}) {
  const segments = relPath.split('/');
  for (let i = 1; i <= segments.length; i += 1) {
    const current = segments.slice(0, i).join('/');
    let stats;
    try {
      stats = await lstat(path.join(root, current));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!optional) errors.push(`${relPath} does not exist`);
      return false;
    }
    if (stats.isSymbolicLink()) {
      errors.push(`${current} is a symbolic link`);
      return false;
    }
    const expectDirectory = i < segments.length || type === 'directory';
    if (expectDirectory ? !stats.isDirectory() : !stats.isFile()) {
      errors.push(`${current} is not a ${expectDirectory ? 'directory' : 'regular file'}`);
      return false;
    }
  }
  return true;
}

async function checkPluginManifests(root, entry, errors) {
  const pluginDir = entry.path.slice('./'.length);
  if (!(await checkRealPath(root, pluginDir, 'directory', errors))) return;

  const versions = [];
  for (const manifestPath of PLUGIN_MANIFEST_PATHS) {
    const file = `${pluginDir}/${manifestPath}`;
    if (!(await checkRealPath(root, file, 'file', errors))) continue;

    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    } catch (error) {
      errors.push(`${file} is not valid JSON: ${error.message}`);
      continue;
    }
    if (!isMapping(manifest)) {
      errors.push(`${file} must be a JSON object`);
      continue;
    }
    if (manifest.name !== entry.name) {
      errors.push(`${file}: name must be "${entry.name}"`);
    }
    if (!isNonEmptyString(manifest.version) || !PLUGIN_VERSION_PATTERN.test(manifest.version)) {
      errors.push(`${file}: version must be a non-empty string of ASCII letters, digits, ".", "+", "_" or "-"`);
      continue;
    }
    versions.push({ file, version: manifest.version });
  }

  if (versions.length === PLUGIN_MANIFEST_PATHS.length && versions[0].version !== versions[1].version) {
    errors.push(
      `${pluginDir}: version differs between ${versions[0].file} (${versions[0].version}) and ${versions[1].file} (${versions[1].version})`,
    );
  }
}

function buildClaudeMarketplace(entries) {
  return {
    name: MARKETPLACE_NAME,
    description: CLAUDE_MARKETPLACE_DESCRIPTION,
    owner: { name: CLAUDE_OWNER_NAME },
    plugins: entries.map((entry) => ({
      name: entry.name,
      source: entry.path,
      description: entry.claude.description,
    })),
  };
}

function buildCodexMarketplace(entries) {
  return {
    name: MARKETPLACE_NAME,
    interface: { displayName: CODEX_DISPLAY_NAME },
    plugins: entries.map((entry) => ({
      name: entry.name,
      source: { source: 'local', path: entry.path },
      policy: {
        installation: entry.codex.policy.installation,
        authentication: entry.codex.policy.authentication,
      },
      category: entry.codex.category,
    })),
  };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readTextIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function main(argv) {
  let options;
  try {
    ({ values: options } = parseArgs({
      args: argv,
      options: { check: { type: 'boolean' }, root: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(USAGE);
    return 1;
  }
  const root = options.root ? path.resolve(options.root) : fileURLToPath(new URL('..', import.meta.url));

  const errors = [];
  const entries = await readCatalog(root, errors);
  for (const entry of entries) {
    await checkPluginManifests(root, entry, errors);
  }
  for (const outputPath of [CLAUDE_MARKETPLACE_PATH, CODEX_MARKETPLACE_PATH]) {
    await checkRealPath(root, outputPath, 'file', errors, { optional: true });
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`Error: ${error}`);
    console.error('No marketplace files were written.');
    return 1;
  }

  const outputs = [
    { relPath: CLAUDE_MARKETPLACE_PATH, content: serialize(buildClaudeMarketplace(entries)) },
    { relPath: CODEX_MARKETPLACE_PATH, content: serialize(buildCodexMarketplace(entries)) },
  ];
  const changed = [];
  for (const output of outputs) {
    const current = await readTextIfExists(path.join(root, output.relPath));
    if (current !== output.content) changed.push({ ...output, missing: current === null });
  }

  if (changed.length === 0) {
    console.log('Up to date.');
    return 0;
  }
  if (options.check) {
    for (const output of changed) {
      console.error(`${output.missing ? 'Missing' : 'Out of date'}: ${output.relPath}`);
    }
    console.error('Run npm run generate to update the marketplace files.');
    return 1;
  }
  for (const output of changed) {
    const file = path.join(root, output.relPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, output.content, { mode: 0o644 });
    console.log(`Updated ${output.relPath}`);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
