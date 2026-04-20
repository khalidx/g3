import child from 'node:child_process'

export async function spawnCommand (params: { cmd: [string, ...string[]], cwd: string }): Promise<void> {
  const proc = child.spawn(params.cmd[0], params.cmd.slice(1), { stdio: 'inherit', cwd: params.cwd })
  const { code } = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve, reject) => {
    proc.on('exit', (code, signal) => {
      resolve({ code, signal })
    })
    proc.on('error', (error) => {
      reject(error)
    })
  })
  if (code === 0) return
  throw new Error(`The command failed: ${params.cmd.join(' ')}`)
}
