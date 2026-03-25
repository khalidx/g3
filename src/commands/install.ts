import type { Command } from '../types'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

type ShellKind = 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'sh'

function detectShell (): ShellKind {
	const shell = (process.env['SHELL'] ?? '').toLowerCase()
	const comspec = (process.env['ComSpec'] ?? '').toLowerCase()
	const term = (process.env['TERM_PROGRAM'] ?? '').toLowerCase()

	if (shell.includes('fish')) return 'fish'
	if (shell.includes('zsh')) return 'zsh'
	if (shell.includes('bash')) return 'bash'
	if (shell.includes('/sh')) return 'sh'

	if (comspec.includes('cmd.exe')) return 'cmd'
	if (comspec.includes('powershell') || process.env['PSModulePath'] || term.includes('powershell')) {
		return 'powershell'
	}

	return process.platform === 'win32' ? 'powershell' : 'sh'
}

function toPosixPath (input: string) {
	return input.replace(/\\/g, '/')
}

function getInstallBinDir () {
	return path.resolve(import.meta.dir, '../../bin')
}

function getProfileLine (params: { shell: ShellKind, binDir: string }) {
	const escaped = toPosixPath(params.binDir)

	if (params.shell === 'fish') return `fish_add_path -m \"${escaped}\"`
	if (params.shell === 'powershell') return `$env:Path = \"${params.binDir};$env:Path\"`
	if (params.shell === 'cmd') return ''
	return `export PATH=\"${escaped}:$PATH\"`
}

function getActivationCommand (params: { shell: ShellKind, binDir: string }) {
	const escaped = toPosixPath(params.binDir)

	if (params.shell === 'fish') return `set -gx PATH \"${escaped}\" $PATH`
	if (params.shell === 'powershell') return `$env:Path = \"${params.binDir};$env:Path\"`
	if (params.shell === 'cmd') return `set PATH=${params.binDir};%PATH%`
	return `export PATH=\"${escaped}:$PATH\"`
}

function getProfilePath (params: { shell: ShellKind, homeDir: string }) {
	if (params.shell === 'zsh') return path.join(params.homeDir, '.zshrc')
	if (params.shell === 'fish') return path.join(params.homeDir, '.config', 'fish', 'config.fish')
	if (params.shell === 'bash') return path.join(params.homeDir, '.bashrc')
	if (params.shell === 'sh') return path.join(params.homeDir, '.profile')
	if (params.shell === 'powershell') {
		return path.join(params.homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
	}
	return undefined
}

async function readTextIfExists (filePath: string) {
	try {
		return await readFile(filePath, 'utf8')
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
			return undefined
		}
		throw error
	}
}

async function appendUniqueLine (params: { filePath: string, line: string }) {
	const current = await readTextIfExists(params.filePath)
	const lines = (current ?? '').split(/\r?\n/)

	if (lines.some((line) => line.trim() === params.line.trim())) {
		return { changed: false }
	}

	const body = current && current.length > 0
		? `${current.replace(/\s*$/, '\n')}${params.line}\n`
		: `${params.line}\n`

	await mkdir(path.dirname(params.filePath), { recursive: true })
	await writeFile(params.filePath, body, 'utf8')
	return { changed: true }
}

function addWindowsUserPath (binDir: string) {
	const currentPath = process.env['Path'] ?? process.env['PATH'] ?? ''
	const pathEntries = currentPath.split(';').map(entry => entry.trim()).filter(Boolean)
	const alreadyPresent = pathEntries.some(entry => entry.toLowerCase() === binDir.toLowerCase())
	if (alreadyPresent) return { changed: false }

	const nextPath = `${currentPath}${currentPath.endsWith(';') || currentPath.length === 0 ? '' : ';'}${binDir}`
	const result = spawnSync('setx', [ 'PATH', nextPath ], { encoding: 'utf8' })

	if (result.status !== 0) {
		const details = (result.stderr || result.stdout || 'Unknown error').trim()
		throw new Error(`Failed to update user PATH via setx: ${details}`)
	}

	return { changed: true }
}

export const command: Command = {
	name: 'install',
	async handler ({ values }) {
		const shell = detectShell()
		const homeDir = os.homedir()
		const binDir = getInstallBinDir()

		const activationCommand = getActivationCommand({ shell, binDir })
		const profilePath = getProfilePath({ shell, homeDir })
		const profileLine = getProfileLine({ shell, binDir })

		let changed = false
		let mode: 'profile' | 'windows-path' | 'manual' = 'manual'

		if (process.platform === 'win32' && shell === 'cmd') {
			const result = addWindowsUserPath(binDir)
			changed = result.changed
			mode = 'windows-path'
		} else if (process.platform === 'win32' && shell === 'powershell' && profilePath) {
			const result = await appendUniqueLine({ filePath: profilePath, line: profileLine })
			changed = result.changed
			mode = 'profile'
		} else if (profilePath && profileLine.length > 0) {
			const result = await appendUniqueLine({ filePath: profilePath, line: profileLine })
			changed = result.changed
			mode = 'profile'
		}

		if (values.json) {
			console.info({
				status: 'ok',
				shell,
				platform: process.platform,
				mode,
				changed,
				binDir,
				profilePath,
				activationCommand
			})
			return
		}

		console.info(`Installing g3 for ${process.platform} (${shell})`)
		if (mode === 'profile') {
			console.info(changed
				? `Updated profile: ${profilePath}`
				: `Profile already configured: ${profilePath}`)
		} else if (mode === 'windows-path') {
			console.info(changed
				? 'Updated user PATH via setx.'
				: 'User PATH already includes g3 bin directory.')
		} else {
			console.info('Could not determine a writable profile file for this terminal.')
		}
		console.info(`Run this now to activate in the current session:\n${activationCommand}`)
		console.info('Then verify with: g3 version')
	}
}
