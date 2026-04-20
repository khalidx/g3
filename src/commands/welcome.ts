import type { Command } from '../types.ts'
import packageJson from '../../package.json' with { type: 'json' }

import pc from 'picocolors'

const welcomeMessage = `
╭─╴╭─╮
│╶╮╶─┤   v${pc.gray(packageJson.version)} | ${pc.italic('Welcome')} to the ${pc.bold(pc.blue('g3'))} CLI!
╰─╯╰─╯

Usage: ${pc.blue('g3')} ${pc.gray('<command> [options]')}
`

export const command: Command = {
  name: 'welcome',
  async handler ({ values }) {
    if (values.json) {
      console.info({ message: welcomeMessage })
    } else {
      console.info(welcomeMessage)
    }
  }
}
