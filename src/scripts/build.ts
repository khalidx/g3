import { $ } from 'bun'
import { rm, mkdir, writeFile } from 'node:fs/promises'

const binaries = [
  { target: 'bun-linux-x64', outfile: 'exec/g3-linux-x64' },
  { target: 'bun-darwin-x64', outfile: 'exec/g3-darwin-x64' },
  { target: 'bun-windows-x64', outfile: 'exec/g3-windows-x64' }
]

await rm('exec', { recursive: true, force: true })
await mkdir('exec', { recursive: true })
await writeFile('exec/.gitignore', '*\n')

await Promise.all(
  binaries.map(binary =>
    $`bun build --compile --target=${binary.target} --outfile=${binary.outfile} src/index.ts`
  )
)
