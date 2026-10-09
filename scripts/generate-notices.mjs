#!/usr/bin/env node
/**
 * Regenerates `THIRD_PARTY_NOTICES.md` from the installed dependency tree.
 *
 * It walks the packages that actually ship with the app (the production
 * dependency closure plus the libraries Vite bundles into the renderer) and
 * reproduces each package's license file verbatim, together with Electron's
 * license and a pointer to the Chromium notices Electron ships separately.
 *
 * Pure Node, so it runs on every platform. Run after any dependency change.
 *
 * Usage: npm run notices
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(ROOT, 'THIRD_PARTY_NOTICES.md')

/**
 * Renderer-bundled libraries. They are devDependencies (Vite compiles them into
 * the renderer bundle) but their code ships, so they belong in the notices.
 */
const EXTRA_SEEDS = [
  'react',
  'react-dom',
  '@base-ui/react',
  'clsx',
  'tailwind-merge',
  'motion',
  'framer-motion',
]

const LICENSE_RE = /^(licen[cs]e|copying|notice)(\..+)?$/i

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Resolves a package the way Node does: nearest `node_modules`, walking up. */
function resolvePackageDir(fromDir, name) {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function findLicenseText(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const hit = entries.find((entry) => entry.isFile() && LICENSE_RE.test(entry.name))
  if (!hit) return null
  try {
    return fs.readFileSync(path.join(dir, hit.name), 'utf8').replace(/\r\n/g, '\n').trim()
  } catch {
    return null
  }
}

function licenseId(pkg) {
  const license = pkg.license
  if (typeof license === 'string') return license
  if (license?.type) return license.type
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((entry) => (typeof entry === 'string' ? entry : entry.type)).join(' OR ')
  }
  return 'UNKNOWN'
}

function authorOf(pkg) {
  const author = pkg.author
  if (typeof author === 'string') return author
  if (author?.name) {
    return [author.name, author.email && `<${author.email}>`, author.url && `(${author.url})`]
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

function copyrightOf(pkg, text) {
  const author = authorOf(pkg)
  if (author) return author
  if (text) {
    const line = text.split('\n').find((entry) => /copyright/i.test(entry))
    if (line) return line.replace(/\s+/g, ' ').trim()
  }
  return ''
}

/** Collects the shipped closure: regular and optional deps, never peer/dev. */
function collectPackages() {
  const rootPkg = readJson(path.join(ROOT, 'package.json'))
  const queue = [...Object.keys(rootPkg.dependencies ?? {}), ...EXTRA_SEEDS].map((name) => [ROOT, name])
  const found = new Map()
  while (queue.length > 0) {
    const [fromDir, name] = queue.shift()
    const dir = resolvePackageDir(fromDir, name)
    if (!dir) continue
    const pkg = readJson(path.join(dir, 'package.json'))
    if (!pkg?.name) continue
    const key = `${pkg.name}@${pkg.version}`
    if (found.has(key)) continue
    found.set(key, { pkg, dir })
    const next = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) }
    for (const dep of Object.keys(next)) queue.push([dir, dep])
  }
  return [...found.values()]
}

function render(packages) {
  const electronText = findLicenseText(path.join(ROOT, 'node_modules', 'electron'))
  const date = new Date().toISOString().slice(0, 10)
  const lines = [
    '# Third-Party Notices',
    '',
    'Handheld Harness is distributed together with the third-party software listed below. Each component remains under its own license; the applicable license text is reproduced with each entry. This file is generated from the pinned dependency tree and covers the packages that ship with the application.',
    '',
    '## Electron and Chromium',
    '',
    'Handheld Harness is built on [Electron](https://www.electronjs.org/) (MIT License, text below). The Electron runtime also bundles Chromium, Node.js and related projects; their notices ship inside the installed application as `LICENSES.chromium.html` (alongside `LICENSE`) and are not duplicated here.',
    '',
  ]
  if (electronText) lines.push('```', electronText, '```', '')
  lines.push('## Bundled components', '', `_Generated ${date} from the installed dependency tree._`, '')

  for (const entry of packages) {
    lines.push(`### ${entry.name} ${entry.version}`, '', `- License: ${entry.license}`)
    if (entry.copyright) lines.push(`- Copyright: ${entry.copyright}`)
    lines.push('')
    if (entry.text) lines.push('```', entry.text, '```')
    else lines.push('_No license file was found in this package; the declared license above applies._')
    lines.push('')
  }
  return lines.join('\n') + '\n'
}

function main() {
  const packages = collectPackages()
    .map(({ pkg, dir }) => {
      let text = findLicenseText(dir)
      let license = licenseId(pkg)
      // OpenCode ships its SDK and per-platform binaries without a license file;
      // they are covered by the MIT license of the `opencode-ai` package.
      if (!text && /opencode/.test(pkg.name)) {
        if (license === 'UNKNOWN') license = 'MIT'
        text = findLicenseText(resolvePackageDir(ROOT, 'opencode-ai'))
      }
      return { name: pkg.name, version: pkg.version, license, text, copyright: copyrightOf(pkg, text) }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)))

  const contents = render(packages)
  fs.writeFileSync(OUT_FILE, contents, 'utf8')
  const licenses = [...new Set(packages.map((entry) => entry.license))].sort().join(', ')
  console.log(
    `wrote ${path.relative(ROOT, OUT_FILE).replace(/\\/g, '/')} (${packages.length} packages; ${licenses})`,
  )
}

try {
  main()
} catch (error) {
  console.error(`notices failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
