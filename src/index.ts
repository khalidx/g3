import { CommandSchema } from './types'

import { parseArgs } from 'node:util'

export async function cli (params: { args: string[] }) {
  const { positionals: [ command, ...rest ], values } = parseArgs({
    args: params.args,
    strict: true,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false }
    }
  })
  const m = (
    (!command && !rest.length) ? await import('./commands/welcome') :
    (command === 'welcome' && !rest.length) ? await import('./commands/welcome') :
    (command === 'version' && !rest.length) ? await import('./commands/version') :
    (command === 'install' && !rest.length) ? await import('./commands/install') :
    (command === 'externals' && !rest.length) ? await import('./commands/externals') :
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
