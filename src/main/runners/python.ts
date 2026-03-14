import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePythonCommand } from '../runtimes/python'
import type { LanguageRunner } from './types'

export const pythonRunner: LanguageRunner = {
  definition: {
    id: 'python',
    displayName: 'Python',
    monacoLanguage: 'python',
    extension: 'py',
    description: 'Executes Python in an isolated interpreter managed by Runbox.',
    template: [
      'values = [2, 4, 6, 8]',
      'summary = sum(values)',
      '',
      "print('Total:', summary)",
      "print('Average:', summary / len(values))"
    ].join('\n')
  },
  async prepare(code) {
    const runtime = await resolvePythonCommand()

    if (!runtime) {
      throw new Error('Python runtime is not installed yet. Select Python and install it first.')
    }

    const runDirectory = await mkdtemp(join(tmpdir(), 'runbox-py-'))
    const filePath = join(runDirectory, 'snippet.py')

    await writeFile(filePath, code, 'utf8')

    return {
      command: runtime.command,
      args: [...runtime.args, '-I', '-u', filePath],
      cwd: runDirectory,
      env: runtime.env,
      cleanup: async () => {
        await rm(runDirectory, { recursive: true, force: true })
      }
    }
  }
}
