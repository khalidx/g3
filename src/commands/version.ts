import type { Command } from '../types.ts'
import packageJson from '../../package.json' with { type: 'json' }

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
