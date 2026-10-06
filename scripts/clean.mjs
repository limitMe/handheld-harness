import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const target of ['out', path.join('tests', 'e2e', 'artifacts')]) {
  await rm(path.join(root, target), { recursive: true, force: true })
}
