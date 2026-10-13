#!/usr/bin/env node
// Type-checks the mod against Claude Code's plugin API declarations.
//
// The declarations (claude-code.d.ts) are written by Claude Code itself and are
// not kept in this repo. Find them one of two ways:
//   1. In a Claude Code session, load the plugin-authoring skill. It prints the
//      path of this build's claude-code.d.ts.
//   2. Run a session with `claude --plugin-dir .` here. The engine then writes
//      .claude-plugin/types/claude-code/index.d.ts, which this script finds.
//
// Usage: node tools/typecheck.mjs [path/to/claude-code.d.ts]
//        (or set CLAUDE_CODE_TYPES to the path)

import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const laid = join(root, '.claude-plugin', 'types', 'claude-code', 'index.d.ts')
const types = process.argv[2] ?? process.env.CLAUDE_CODE_TYPES ?? (existsSync(laid) ? laid : undefined)

if (!types || !existsSync(types)) {
  console.error('Could not find claude-code.d.ts. Pass its path, set CLAUDE_CODE_TYPES, or see the top of this file.')
  process.exit(2)
}

// The tsconfig lives outside the repo, as the API's own header recommends.
const dir = mkdtempSync(join(tmpdir(), 'claude-cat-tsc-'))
const tsconfig = {
  compilerOptions: {
    target: 'es2023', lib: ['es2023'], types: [],
    module: 'esnext', moduleResolution: 'bundler',
    strict: true, noUncheckedIndexedAccess: true,
    noEmit: true, skipLibCheck: true,
    jsx: 'react', jsxFactory: 'h', jsxFragmentFactory: 'Fragment',
  },
  files: [resolve(types)],
  include: ['hooks', 'types', 'tests'].map(d => join(root, d).replaceAll('\\', '/')),
}
const config = join(dir, 'tsconfig.json')
writeFileSync(config, JSON.stringify(tsconfig, null, 2))

try {
  execSync(`npx -y -p typescript@5.6.3 tsc -p "${config}"`, { stdio: 'inherit' })
  console.log('Type check passed.')
} catch {
  process.exit(1)
}
