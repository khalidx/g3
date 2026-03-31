import type { Command } from '../types'
import packageJson from '../../package.json'

export const command: Command = {
  name: 'version',
  async handler ({ values }) {
    if (values.json) {
      console.info({ version: packageJson.version })
    } else {
      console.info(packageJson.version)
    }
  }
}
