import packageJson from '../package.json'

export async function cli (params: { args: string[] }) {
  const [command, ...rest] = params.args
  if (command === 'version' && rest.length === 0) {
    console.info(packageJson.version)
  } else {
    console.error(`Error: Invalid command or arguments.`)
    process.exitCode = 1
  }  
}

if (import.meta.main) {
  cli({ args: process.argv.slice(2) })
}
