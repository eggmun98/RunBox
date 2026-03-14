export interface PythonRuntimeArtifactConfig {
  url: string
  sha256: string
  entryPoint: string
  pythonHome?: string
}

export interface PythonRuntimeConfig {
  version: string
  artifacts: Partial<Record<string, PythonRuntimeArtifactConfig>>
}

export const PYTHON_RUNTIME_CONFIG: PythonRuntimeConfig = {
  version: '3.12.8',
  artifacts: {
    'darwin-arm64': {
      url: '',
      sha256: '',
      entryPoint: 'python/bin/python3',
      pythonHome: 'python'
    },
    'darwin-x64': {
      url: '',
      sha256: '',
      entryPoint: 'python/bin/python3',
      pythonHome: 'python'
    },
    'win32-x64': {
      url: '',
      sha256: '',
      entryPoint: 'python/python.exe',
      pythonHome: 'python'
    }
  }
}
