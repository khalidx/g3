import type { Command } from '../types'
import packageJson from '../../package.json'

import { gray, blue, italic, bold } from 'picocolors'

const welcomeMessage = `
╭─╴╭─╮
│╶╮╶─┤   v${gray(packageJson.version)} | ${italic('Welcome')} to the ${bold(blue('g3'))} CLI!
╰─╯╰─╯

Usage: ${blue('g3')} ${gray('<command> [options]')}
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
