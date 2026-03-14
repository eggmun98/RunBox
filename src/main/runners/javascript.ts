import { rm, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LanguageRunner } from './types'

export const javascriptRunner: LanguageRunner = {
  definition: {
    id: 'javascript',
    displayName: 'JavaScript',
    monacoLanguage: 'javascript',
    extension: 'mjs',
    description: 'Executes JavaScript in a separate Node process bundled with Electron.',
    template: [
      'const values = [2, 4, 6, 8]',
      "const summary = values.reduce((sum, value) => sum + value, 0)",
      '',
      "console.log('Total:', summary)",
      "console.log('Average:', summary / values.length)"
    ].join('\n')
  },
  async prepare(code) {
    const runDirectory = await mkdtemp(join(tmpdir(), 'runbox-js-'))
    const filePath = join(runDirectory, 'snippet.mjs')

    await writeFile(filePath, code, 'utf8')

    return {
      command: process.execPath,
      args: [filePath],
      cwd: runDirectory,
      cleanup: async () => {
        await rm(runDirectory, { recursive: true, force: true })
      }
    }
  }
}

