import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, gitCapture } from './lib/stable'

/**
 * Checks that the GitHub Release for the current `package.json` version exists,
 * is neither draft nor prerelease, and carries the three auto-update assets.
 *
 * Usage: npm run release:verify
 */
interface ReleaseAsset {
  name: string
}

interface GitHubRelease {
  draft: boolean
  prerelease: boolean
  assets: ReleaseAsset[]
}

interface PackageJson {
  name: string
  version: string
}

function resolveSlug(): string {
  const remote = gitCapture(['remote', 'get-url', 'origin'], REPO_ROOT)
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(remote)
  if (match == null) {
    throw new Error(`cannot parse a GitHub owner/repo from "origin" (${remote})`)
  }
  return `${match[1]}/${match[2]}`
}

async function main(): Promise<void> {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as PackageJson
  const tag = `v${pkg.version}`
  const slug = resolveSlug()

  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  const token = process.env.GH_TOKEN?.trim()
  if (token) headers.authorization = `Bearer ${token}`

  const response = await fetch(`https://api.github.com/repos/${slug}/releases/tags/${tag}`, {
    headers,
  })
  if (response.status === 404) {
    throw new Error(`no GitHub release found for tag ${tag} in ${slug}`)
  }
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} ${response.statusText}`)
  }

  const release = (await response.json()) as GitHubRelease
  const names = new Set(release.assets.map((asset) => asset.name))
  const expected = [
    `${pkg.name}-${pkg.version}-setup.exe`,
    `${pkg.name}-${pkg.version}-setup.exe.blockmap`,
    'latest.yml',
  ]

  let ok = true
  if (release.draft) {
    console.error(`FAIL  release ${tag} is a draft; electron-updater ignores drafts`)
    ok = false
  }
  if (release.prerelease) {
    console.error(`FAIL  release ${tag} is a prerelease; electron-updater ignores it`)
    ok = false
  }
  for (const name of expected) {
    if (names.has(name)) {
      console.log(`ok    ${name}`)
    } else {
      console.error(`MISS  ${name}`)
      ok = false
    }
  }

  if (!ok) {
    process.exitCode = 1
    return
  }
  console.log(`Release ${tag} in ${slug} is complete.`)
}

main().catch((error: unknown) => {
  console.error('release:verify failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
