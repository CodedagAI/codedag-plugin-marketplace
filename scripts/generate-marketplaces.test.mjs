import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-marketplaces.mjs');
const CATALOG = path.join(REPO_ROOT, 'catalog', 'codedag.yaml');
const CLAUDE_MARKETPLACE = '.claude-plugin/marketplace.json';
const CODEX_MARKETPLACE = '.agents/plugins/marketplace.json';
const VERSION = '0.0.7-local.60';

const EXPECTED_CLAUDE_MARKETPLACE = `{
  "name": "codedag",
  "description": "CodeDAG plugin marketplace for Claude Code and Codex.",
  "owner": {
    "name": "CodeDAG"
  },
  "plugins": [
    {
      "name": "codedag",
      "source": "./plugins/codedag",
      "description": "Plugin that teaches Claude Code how to use the CodeDAG CLI."
    }
  ]
}
`;

const EXPECTED_CODEX_MARKETPLACE = `{
  "name": "codedag",
  "interface": {
    "displayName": "CodeDAG"
  },
  "plugins": [
    {
      "name": "codedag",
      "source": {
        "source": "local",
        "path": "./plugins/codedag"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
`;

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'codedag-plugins-generator-'));
  tempDirs.push(dir);
  return dir;
}

function writePluginManifests(pluginDir, { claude = {}, codex = {} } = {}) {
  for (const [manifestDir, overrides] of [['.claude-plugin', claude], ['.codex-plugin', codex]]) {
    mkdirSync(path.join(pluginDir, manifestDir), { recursive: true });
    const manifest = { name: 'codedag', version: VERSION, description: 'CodeDAG test plugin.', ...overrides };
    writeFileSync(path.join(pluginDir, manifestDir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

// A repository with the committed catalog and a plugin directory whose manifests both use VERSION.
function createRepo(manifestOverrides) {
  const root = makeTempDir();
  mkdirSync(path.join(root, 'catalog'));
  copyFileSync(CATALOG, path.join(root, 'catalog', 'codedag.yaml'));
  writePluginManifests(path.join(root, 'plugins', 'codedag'), manifestOverrides);
  return root;
}

function runGenerator(root, ...args) {
  return spawnSync(process.execPath, [GENERATOR, '--root', root, ...args], { encoding: 'utf8', timeout: 30_000 });
}

function stderrLines(result) {
  return result.stderr.split('\n');
}

function readOutput(root, relPath) {
  return readFileSync(path.join(root, relPath), 'utf8');
}

function assertNoOutputs(root) {
  assert.equal(existsSync(path.join(root, CLAUDE_MARKETPLACE)), false);
  assert.equal(existsSync(path.join(root, CODEX_MARKETPLACE)), false);
}

describe('generate', () => {
  test('writes both marketplace files from the catalog', () => {
    const root = createRepo();

    const result = runGenerator(root);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `Updated ${CLAUDE_MARKETPLACE}\nUpdated ${CODEX_MARKETPLACE}\n`);
    assert.equal(readOutput(root, CLAUDE_MARKETPLACE), EXPECTED_CLAUDE_MARKETPLACE);
    assert.equal(readOutput(root, CODEX_MARKETPLACE), EXPECTED_CODEX_MARKETPLACE);
  });

  test('a second run leaves both files untouched and --check passes', () => {
    const root = createRepo();
    assert.equal(runGenerator(root).status, 0);
    const mtimes = [CLAUDE_MARKETPLACE, CODEX_MARKETPLACE].map((relPath) => statSync(path.join(root, relPath)).mtimeMs);

    const second = runGenerator(root);
    const check = runGenerator(root, '--check');

    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, 'Up to date.\n');
    assert.deepEqual(
      [CLAUDE_MARKETPLACE, CODEX_MARKETPLACE].map((relPath) => statSync(path.join(root, relPath)).mtimeMs),
      mtimes,
    );
    assert.equal(check.status, 0, check.stderr);
    assert.equal(check.stdout, 'Up to date.\n');
  });
});

describe('validation failures exit 1 and write neither file', () => {
  const cases = [
    {
      name: 'manifest versions differ',
      setup: () => createRepo({ codex: { version: '0.0.7-local.61' } }),
      error: 'plugins/codedag: version differs between',
    },
    {
      name: 'manifest name does not match the catalog entry',
      setup: () => createRepo({ claude: { name: 'other' } }),
      error: 'plugins/codedag/.claude-plugin/plugin.json: name must be "codedag"',
    },
    {
      name: 'manifest version has characters Codex rejects',
      setup: () => createRepo({ claude: { version: '0.0.7/local' }, codex: { version: '0.0.7/local' } }),
      error: 'plugins/codedag/.claude-plugin/plugin.json: version must be',
    },
    {
      name: 'plugin directory is missing',
      setup: () => {
        const root = createRepo();
        rmSync(path.join(root, 'plugins'), { recursive: true });
        return root;
      },
      error: 'plugins/codedag does not exist',
    },
    {
      name: 'plugin directory is a symbolic link',
      setup: () => {
        const root = createRepo();
        const outside = makeTempDir();
        writePluginManifests(outside);
        rmSync(path.join(root, 'plugins', 'codedag'), { recursive: true });
        symlinkSync(outside, path.join(root, 'plugins', 'codedag'), 'junction');
        return root;
      },
      error: 'plugins/codedag is a symbolic link',
    },
    {
      name: 'catalog entry has an unknown key',
      setup: () => {
        const root = createRepo();
        writeFileSync(path.join(root, 'catalog', 'codedag.yaml'), `${readFileSync(CATALOG, 'utf8')}    version: 1.0.0\n`);
        return root;
      },
      error: 'catalog/codedag.yaml: plugins[0] has unknown key "version"',
    },
    {
      name: 'catalog has an invalid Codex policy',
      setup: () => {
        const root = createRepo();
        const catalog = readFileSync(CATALOG, 'utf8').replace('installation: AVAILABLE', 'installation: available');
        writeFileSync(path.join(root, 'catalog', 'codedag.yaml'), catalog);
        return root;
      },
      error: 'catalog/codedag.yaml: plugins[0].codex.policy.installation must be one of',
    },
    {
      name: 'two catalog files define the same plugin',
      setup: () => {
        const root = createRepo();
        copyFileSync(CATALOG, path.join(root, 'catalog', 'other.yaml'));
        return root;
      },
      error: 'catalog/other.yaml: plugin "codedag" is already defined in catalog/codedag.yaml',
    },
  ];

  for (const { name, setup, error } of cases) {
    test(name, () => {
      const root = setup();

      const result = runGenerator(root);

      assert.equal(result.status, 1);
      assert.ok(stderrLines(result).some((line) => line.startsWith(`Error: ${error}`)), result.stderr);
      assertNoOutputs(root);
    });
  }
});

describe('--check', () => {
  test('fails without writing when the files are missing', () => {
    const root = createRepo();

    const result = runGenerator(root, '--check');

    assert.equal(result.status, 1);
    assert.ok(stderrLines(result).includes(`Missing: ${CLAUDE_MARKETPLACE}`), result.stderr);
    assert.ok(stderrLines(result).includes(`Missing: ${CODEX_MARKETPLACE}`), result.stderr);
    assertNoOutputs(root);
  });

  test('fails without writing when a file is out of date', () => {
    const root = createRepo();
    assert.equal(runGenerator(root).status, 0);
    writeFileSync(path.join(root, CODEX_MARKETPLACE), '{}\n');

    const result = runGenerator(root, '--check');

    assert.equal(result.status, 1);
    assert.ok(stderrLines(result).includes(`Out of date: ${CODEX_MARKETPLACE}`), result.stderr);
    assert.equal(result.stderr.includes(CLAUDE_MARKETPLACE), false, result.stderr);
    assert.equal(readOutput(root, CODEX_MARKETPLACE), '{}\n');
    assert.equal(readOutput(root, CLAUDE_MARKETPLACE), EXPECTED_CLAUDE_MARKETPLACE);
  });
});
