import { CommandSchema } from './types.ts'

import { parseArgs } from 'node:util'

export async function cli (params: { args: string[] }) {
  const { positionals: [ command, ...rest ], values } = parseArgs({
    args: params.args,
    strict: true,
    allowPositionals: true,
    options: {
      version: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false }
    }
  })
  const m = (
    (values.version) ? await import('./commands/version.ts') :
    (!command && !rest.length) ? await import('./commands/welcome.ts') :
    (command === 'welcome' && !rest.length) ? await import('./commands/welcome.ts') :
    (command === 'version' && !rest.length) ? await import('./commands/version.ts') :
    (command === 'externals' && !rest.length) ? await import('./commands/externals.ts') :
    undefined
  )
  if (m) {
    const command = CommandSchema.parse(m.command)
    await command.handler({ values })
  } else {
    if (values.json) console.error({ error: 'Invalid command or arguments.' })
    else console.error(`Error: Invalid command or arguments.`)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  cli({ args: process.argv.slice(2) })
}
