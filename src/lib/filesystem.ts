import { hasErrorCode } from './error.ts'

import fs from 'node:fs/promises'
import path from 'node:path'

export async function pathExists (params: { path: string }): Promise<boolean> {
  try {
    await fs.access(params.path)
    return true
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false
    throw error
  }
}

export async function readFileIfExists (params: { path: string }): Promise<string | undefined> {
  try {
    return await fs.readFile(params.path, 'utf8')
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined
    throw error
  }
}

export async function appendOrReplaceFileSection (params: { path: string, content: string, sectionName: string, commentStyle: '#' | '//' }): Promise<void> {
  const startMarker = `${params.commentStyle} <!-- section:start name=${JSON.stringify(params.sectionName)} -->`
  const endMarker = `${params.commentStyle} <!-- section:end name=${JSON.stringify(params.sectionName)} -->`
  const text = await readFileIfExists({ path: params.path })
  if (!text) {
    await fs.mkdir(path.dirname(params.path), { recursive: true })
    await fs.writeFile(params.path, `${startMarker}\n${params.content}\n${endMarker}\n`)
    return
  }
  const startOfSection = text.indexOf(startMarker)
  const endOfSection = text.lastIndexOf(endMarker)
  if (text.indexOf(endMarker) !== endOfSection) {
    throw new Error(`The section "${params.sectionName}" is malformed. Multiple end markers found.`)
  }
  if (startOfSection === -1 && endOfSection === -1) {
    await fs.writeFile(params.path, `${text}\n${startMarker}\n${params.content}\n${endMarker}\n`)
    return
  }
  if (startOfSection === -1 || endOfSection === -1) {
    throw new Error(`The section "${params.sectionName}" is malformed. Both markers must be present to replace the section content.`)
  }
  if (startOfSection >= endOfSection) {
    throw new Error('The end marker must appear after the start marker in the file.')
  }
  const before = text.slice(0, startOfSection + startMarker.length)
  const after = text.slice(endOfSection)
  await fs.writeFile(params.path, `${before}\n${params.content}\n${after}`)
}
