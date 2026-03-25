import { type Command, type External, ExternalsSchema } from '../types'
import { readFileIfExists, appendOrReplaceFileSection } from '../lib/filesystem'

import { blue, green, bold } from 'picocolors'
import { exists, lstat, mkdir, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnCommand } from '../lib/spawn'

async function loadExternalsConfig (params: { cwd: string }) {
  const configFilePath = path.join(params.cwd, './externals.json')
  const configFile = await readFileIfExists({ path: configFilePath })
  if (configFile === undefined) return undefined
  const config = await ExternalsSchema.parseAsync(JSON.parse(configFile))
  return { configFilePath, config }
}

interface WorkspaceFolder {
  path: string
}

interface CodeWorkspace {
  folders?: WorkspaceFolder[]
  settings?: Record<string, unknown>
}

async function loadWorkspaceConfig (params: { path: string }): Promise<CodeWorkspace | undefined> {
  const content = await readFileIfExists({ path: params.path })
  if (content === undefined) return undefined
  try {
    return JSON.parse(content) as CodeWorkspace
  } catch {
    return undefined
  }
}

function isParentPath (folderPath: string): boolean {
  return folderPath === '../'
}

async function generateAndSyncWorkspaceConfig (params: {
  workspaceConfigPath: string
  externals: Exclude<Awaited<ReturnType<typeof loadExternalsConfig>>, undefined>
}) {
  const { workspaceConfigPath, externals } = params

  // Generate paths for all externals (relative to .externals/ directory where workspace file lives)
  const generatedExternalPaths = new Set(
    Object.values(externals.config).map(external => `./${external.repo}`)
  )

  // Load existing workspace config to preserve user-added paths
  const existingWorkspace = await loadWorkspaceConfig({ path: workspaceConfigPath })
  const userAddedPaths = existingWorkspace?.folders
    ?.map(f => f.path)
    .filter(p => !isParentPath(p) && !generatedExternalPaths.has(p) && !p.startsWith('./')) ?? []

  // Build the new folder list
  const folders: WorkspaceFolder[] = []

  // Always add parent first
  folders.push({ path: '../' })

  // Add all externals from the config
  for (const externalPath of generatedExternalPaths) {
    folders.push({ path: externalPath })
  }

  // Add back user-added paths
  for (const userPath of userAddedPaths) {
    folders.push({ path: userPath })
  }

  const existingSettings = existingWorkspace?.settings ?? {}
  const settings = ('scm.defaultViewMode' in existingSettings)
    ? existingSettings
    : { ...existingSettings, 'scm.defaultViewMode': 'tree' }

  // Write the workspace config
  const workspaceConfig: CodeWorkspace = { ...existingWorkspace, folders, settings }
  await writeFile(workspaceConfigPath, JSON.stringify(workspaceConfig, null, 2) + '\n')
  return workspaceConfigPath
}

function toExcludePath (target: string) {
  return target.replace(/^\.\//, '').replace(/\\/g, '/')
}

async function ensureExcludes (params: { cwd: string, targets: string[] }) {
  const excludeFilePath = path.join(params.cwd, '.git/info/exclude')
  const desiredRules = Array.from(new Set([ '.externals/', ...params.targets.map(toExcludePath) ]))
  await appendOrReplaceFileSection({
    path: excludeFilePath,
    content: desiredRules.join('\n'),
    sectionName: 'rules managed by g3 externals',
    commentStyle: '#'
  })
}

async function syncExternal (params: { cwd: string, external: External }) {
  const externalsDirectory = path.join(params.cwd, './.externals/')
  const repoDir = path.join(externalsDirectory, params.external.source.repo)
  const targetDir = path.join(params.cwd, params.external.target)

  if (!(await exists(path.join(repoDir, '.git')))) {
    await mkdir(path.dirname(repoDir), { recursive: true })
    await spawnCommand({ cmd: ['git', 'clone', '--filter=blob:none', `https://github.com/${params.external.source.repo}`, repoDir], cwd: params.cwd })
  }

  await spawnCommand({ cmd: ['git', '-C', repoDir, 'remote', 'set-url', 'origin', `https://github.com/${params.external.source.repo}`], cwd: params.cwd })
  await spawnCommand({ cmd: ['git', '-C', repoDir, 'fetch', '--prune', 'origin', params.external.source.ref], cwd: params.cwd })
  await spawnCommand({ cmd: ['git', '-C', repoDir, 'checkout', params.external.source.ref], cwd: params.cwd })
  await spawnCommand({ cmd: ['git', '-C', repoDir, 'clean', '-fdx'], cwd: params.cwd })

  await mkdir(targetDir, { recursive: true })

  if (await exists(targetDir)) {
    const localStat = await lstat(targetDir)
    if (localStat.isSymbolicLink()) {
      const existingTarget = await readlink(targetDir)
      const desiredTarget = path.relative(path.dirname(targetDir), path.join(repoDir, params.external.source.path))
      if (existingTarget === desiredTarget) return { targetDir }
    }
    await rm(targetDir, { recursive: true, force: true })
  }

  const isWindows = process.platform === 'win32'
  const linkType = isWindows ? 'junction' : 'dir'
  const symlinkTarget = isWindows
    ? path.join(repoDir, params.external.source.path)
    : path.relative(path.dirname(targetDir), path.join(repoDir, params.external.source.path))
  ;
  await symlink(symlinkTarget, targetDir, linkType)
  return { targetDir }
}

export const command: Command = {
  name: 'externals',
  async handler ({ values }) {
    const cwd = process.cwd()
    const externals = await loadExternalsConfig({ cwd })

    if (!externals) {
      const message = 'No externals config found. Add a externals.json to configure externals.'
      if (values.json) console.info({ status: 'noop', reason: message })
      else console.info(message)
      return
    }

    const synced: Array<{ targetDir: string }> = []

    for (const [ target, external ] of Object.entries(externals.config)) {
      const result = await syncExternal({ cwd, external: { target, source: external } })
      synced.push(result)
    }

    await ensureExcludes({ cwd, targets: Object.keys(externals.config) })

    const workspaceConfigPath = path.join(cwd, './.externals/externals.code-workspace')
    const workspaceConfigGenerated = await generateAndSyncWorkspaceConfig({ workspaceConfigPath, externals })

    if (values.json) {
      console.info({ status: 'ok', configFilePath: externals.configFilePath, workspaceConfigPath: workspaceConfigGenerated, synced })
    } else {
      console.info('-'.repeat(process.stdout.columns))
      console.info(`Configured externals from ${externals.configFilePath}`)
      for (const external of synced) {
        console.info(`- ${external.targetDir}`)
      }
      console.info('-'.repeat(process.stdout.columns))
      console.info(`Generated workspace config at ${workspaceConfigGenerated}`)
      console.info(`If you haven't already, to ${bold(blue('open the workspace'))} in VSCode, run:`)
      console.info('  code .externals/externals.code-workspace')
      console.info('Or use the VSCode UI: File > Open Workspace from File...')
      console.info('-'.repeat(process.stdout.columns))
      console.info(`git externals | ${green('success')}`)
    }
  }
}
