import githubWorkflowsCli from '../../.github/workflows/cli.yml'

import { $ } from 'bun'
import { parseArgs } from 'node:util'
import { rm, mkdir, writeFile } from 'node:fs/promises'
import { z } from 'zod'

const { values } = parseArgs({
  strict: true,
  allowPositionals: false,
  allowNegative: false,
  options: {
    all: { type: 'boolean' },
    target: { type: 'string' },
    outfile: { type: 'string' }
  }
})

const targets = z.array(z.object({ bun: z.object({ target: z.string(), outfile: z.string() }) }))
  .parse(githubWorkflowsCli.jobs['test-cli'].strategy.matrix.os)
  .filter(({ bun }) => {
    if (values.all || (!values.target && !values.outfile)) return true
    if (!values.all && values.target === bun.target && values.outfile === bun.outfile) return true
    return false
  })
;

if (targets.length === 0) {
  console.error('No valid targets found. Please check the provided arguments and the GitHub workflow configuration.')
  process.exitCode = 1
} else {
  if (targets.length > 1) {
    await rm('exec', { recursive: true, force: true })
  }
  await mkdir('exec', { recursive: true })
  await writeFile('exec/.gitignore', '*\n')
  await Promise.all(
    targets.map(({ bun }) =>
      $`bun build --compile --target=${bun.target} --outfile=${bun.outfile} src/index.ts`
    )
  )
}
