export async function spawnCommand (params: { cmd: string[], cwd: string }): Promise<void> {
  const proc = Bun.spawn({ cmd: params.cmd, stdio: [ 'inherit', 'inherit', 'inherit' ], cwd: params.cwd })
  const exitCode = await proc.exited
  if (exitCode === 0) return
  throw new Error(`The command failed: ${params.cmd.join(' ')}`)
}
