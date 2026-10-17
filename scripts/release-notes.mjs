#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version (used as the GitHub release notes).
// Usage: node scripts/release-notes.mjs 0.4.0   → exits 1 if the section is missing or empty.
import { readFileSync } from 'node:fs'

const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!version) {
  console.error('usage: release-notes.mjs <version>')
  process.exit(2)
}

const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const lines = text.split('\n')
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section. Rename "## [Não lançado]" to "## [${version}] - YYYY-MM-DD" before tagging.`)
  process.exit(1)
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['))
const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim()
if (!body) {
  console.error(`The "## [${version}]" section in CHANGELOG.md is empty.`)
  process.exit(1)
}
console.log(body)
