import packageJson from '../package.json'
import * as types from './types'

import { parseArgs } from 'node:util'

export async function cli (params: { args: string[] }) {
  const { positionals: [ command, ...rest ], values } = parseArgs({
    args: params.args,
    strict: true,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' }
    }
  })
  if (command === 'version' && rest.length === 0) {
    if (values.json) console.info({ version: packageJson.version })
    else console.info(packageJson.version)
  } else if (command === 'types' && rest.length === 0) {
    if (values.json) console.info(Object.keys(types))
    else console.info(Object.keys(types).map(type => `- ${type}`).join('\n'))
  } else {
    if (values.json) console.error({ error: 'Invalid command or arguments.' })
    else console.error(`Error: Invalid command or arguments.`)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  cli({ args: process.argv.slice(2) })
}
