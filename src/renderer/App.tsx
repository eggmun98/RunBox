import Editor from '@monaco-editor/react'
import { useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent
} from 'react'
import type { LanguageDefinition, RunnerEvent } from '../shared/runner'

const DEFAULT_TIMEOUT_MS = 4000
const AUTO_RUN_DELAY_MS = 650
const STORAGE_KEY = 'runbox.workspace.v1'
const DEFAULT_EDITOR_WIDTH_PERCENT = 50
const MIN_EDITOR_WIDTH_PERCENT = 30
const MAX_EDITOR_WIDTH_PERCENT = 70

interface WorkspaceTab {
  id: string
  title: string
  languageId: string
  code: string
  stdout: string
  stderr: string
  status: string
  isRunning: boolean
  currentRunId: string | null
}

interface PersistedWorkspace {
  activeTabId: string | null
  autoRun?: boolean
  timeoutMs?: number
  editorWidthPercent?: number
  tabs: Array<Pick<WorkspaceTab, 'id' | 'title' | 'languageId' | 'code'>>
}

function describeExitCode(exitCode: number | null): string {
  if (exitCode === 0) {
    return 'Completed successfully.'
  }

  if (exitCode === null) {
    return 'Exited without a numeric code.'
  }

  return `Exited with code ${exitCode}.`
}

function getLanguageLabel(languageId: string, languages: LanguageDefinition[]): string {
  return languages.find((language) => language.id === languageId)?.displayName ?? languageId
}

function createWorkspaceTab(language: LanguageDefinition, title: string): WorkspaceTab {
  return {
    id: crypto.randomUUID(),
    title,
    languageId: language.id,
    code: language.template,
    stdout: '',
    stderr: '',
    status: `Ready for ${language.displayName}.`,
    isRunning: false,
    currentRunId: null
  }
}

function restoreWorkspaceTab(
  tab: Pick<WorkspaceTab, 'id' | 'title' | 'languageId' | 'code'>,
  languages: LanguageDefinition[]
): WorkspaceTab | null {
  const language = languages.find((candidate) => candidate.id === tab.languageId)

  if (!language) {
    return null
  }

  return {
    ...tab,
    stdout: '',
    stderr: '',
    status: `Restored ${tab.title || 'Untitled'} from your last session.`,
    isRunning: false,
    currentRunId: null
  }
}

function getNextTabTitle(tabs: WorkspaceTab[]): string {
  let highestNumber = 0

  for (const tab of tabs) {
    const match = /^Script (\d+)$/i.exec(tab.title.trim())

    if (match) {
      highestNumber = Math.max(highestNumber, Number(match[1]))
    }
  }

  return `Script ${highestNumber + 1}`
}

function readPersistedWorkspace(): PersistedWorkspace | null {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as PersistedWorkspace

    if (!Array.isArray(parsed.tabs)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS
  }

  return timeoutMs
}

function normalizeEditorWidth(editorWidthPercent: number | undefined): number {
  if (
    typeof editorWidthPercent !== 'number' ||
    !Number.isFinite(editorWidthPercent)
  ) {
    return DEFAULT_EDITOR_WIDTH_PERCENT
  }

  return Math.min(
    MAX_EDITOR_WIDTH_PERCENT,
    Math.max(MIN_EDITOR_WIDTH_PERCENT, editorWidthPercent)
  )
}

function handleEditorWillMount(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme('runbox-night', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6B7390' },
      { token: 'keyword', foreground: '8C7CFF' },
      { token: 'number', foreground: 'FFD98A' },
      { token: 'string', foreground: '7DEBFF' },
      { token: 'delimiter', foreground: 'AAB5D6' }
    ],
    colors: {
      'editor.background': '#09101d',
      'editor.foreground': '#edf2ff',
      'editorLineNumber.foreground': '#52607f',
      'editorLineNumber.activeForeground': '#d8e0fb',
      'editorCursor.foreground': '#6ff2ff',
      'editor.selectionBackground': '#19345a',
      'editor.inactiveSelectionBackground': '#132845',
      'editor.lineHighlightBackground': '#0d1628',
      'editorIndentGuide.background1': '#17243d',
      'editorIndentGuide.activeBackground1': '#2d4574'
    }
  })
}

function buildInitialWorkspace(languages: LanguageDefinition[]): {
  tabs: WorkspaceTab[]
  activeTabId: string
  autoRun: boolean
  timeoutMs: number
  editorWidthPercent: number
  message: string
} {
  const [defaultLanguage] = languages
  const persistedWorkspace = readPersistedWorkspace()

  if (!persistedWorkspace) {
    const initialTab = createWorkspaceTab(defaultLanguage, 'Script 1')

    return {
      tabs: [initialTab],
      activeTabId: initialTab.id,
      autoRun: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      editorWidthPercent: DEFAULT_EDITOR_WIDTH_PERCENT,
      message: `Started a fresh ${defaultLanguage.displayName} workspace.`
    }
  }

  const restoredTabs = persistedWorkspace.tabs.reduce<WorkspaceTab[]>((accumulator, tab) => {
    const restoredTab = restoreWorkspaceTab(tab, languages)

    if (restoredTab) {
      accumulator.push(restoredTab)
    }

    return accumulator
  }, [])

  if (restoredTabs.length === 0) {
    const fallbackTab = createWorkspaceTab(defaultLanguage, 'Script 1')

    return {
      tabs: [fallbackTab],
      activeTabId: fallbackTab.id,
      autoRun: persistedWorkspace.autoRun ?? true,
      timeoutMs: normalizeTimeout(persistedWorkspace.timeoutMs),
      editorWidthPercent: normalizeEditorWidth(persistedWorkspace.editorWidthPercent),
      message: `Recovered with a fresh ${defaultLanguage.displayName} tab.`
    }
  }

  const activeTabId = restoredTabs.some((tab) => tab.id === persistedWorkspace.activeTabId)
    ? (persistedWorkspace.activeTabId ?? restoredTabs[0].id)
    : restoredTabs[0].id

  return {
    tabs: restoredTabs,
    activeTabId,
    autoRun: persistedWorkspace.autoRun ?? true,
    timeoutMs: normalizeTimeout(persistedWorkspace.timeoutMs),
    editorWidthPercent: normalizeEditorWidth(persistedWorkspace.editorWidthPercent),
    message: 'Restored your previous workspace.'
  }
}

export default function App(): JSX.Element {
  const [languages, setLanguages] = useState<LanguageDefinition[]>([])
  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [autoRun, setAutoRun] = useState(true)
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS)
  const [editorWidthPercent, setEditorWidthPercent] = useState(
    DEFAULT_EDITOR_WIDTH_PERCENT
  )
  const [workspaceMessage, setWorkspaceMessage] = useState('Loading language registry...')
  const pendingRunTabIdRef = useRef<string | null>(null)
  const splitPaneRef = useRef<HTMLElement | null>(null)
  const bootstrappedRef = useRef(false)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const selectedLanguage =
    languages.find((language) => language.id === activeTab?.languageId) ?? null
  const splitPaneStyle = {
    '--editor-width': `${editorWidthPercent}%`
  } as CSSProperties

  useEffect(() => {
    let mounted = true

    void window.runbox
      .getLanguages()
      .then((registeredLanguages) => {
        if (!mounted || registeredLanguages.length === 0) {
          return
        }

        const workspace = buildInitialWorkspace(registeredLanguages)

        setLanguages(registeredLanguages)
        setTabs(workspace.tabs)
        setActiveTabId(workspace.activeTabId)
        setAutoRun(workspace.autoRun)
        setTimeoutMs(workspace.timeoutMs)
        setEditorWidthPercent(workspace.editorWidthPercent)
        setWorkspaceMessage(workspace.message)
        bootstrappedRef.current = true
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return
        }

        setWorkspaceMessage(`Failed to load the language registry: ${String(error)}`)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!bootstrappedRef.current || tabs.length === 0 || !activeTabId) {
      return
    }

    const persistedWorkspace: PersistedWorkspace = {
      activeTabId,
      autoRun,
      timeoutMs,
      editorWidthPercent,
      tabs: tabs.map(({ id, title, languageId, code }) => ({
        id,
        title,
        languageId,
        code
      }))
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedWorkspace))
  }, [tabs, activeTabId, autoRun, timeoutMs, editorWidthPercent])

  useEffect(() => {
    const unsubscribe = window.runbox.onRunnerEvent((event: RunnerEvent) => {
      if (event.type === 'started') {
        const targetTabId = pendingRunTabIdRef.current
        pendingRunTabIdRef.current = null

        if (!targetTabId) {
          return
        }

        setTabs((currentTabs) =>
          currentTabs.map((tab) => {
            if (tab.id !== targetTabId) {
              return tab
            }

            return {
              ...tab,
              stdout: '',
              stderr: '',
              isRunning: true,
              currentRunId: event.runId,
              status: `Running ${getLanguageLabel(event.languageId, languages)}...`
            }
          })
        )

        return
      }

      setTabs((currentTabs) =>
        currentTabs.map((tab) => {
          if (tab.currentRunId !== event.runId) {
            return tab
          }

          if (event.type === 'stdout') {
            return {
              ...tab,
              stdout: tab.stdout + event.chunk
            }
          }

          if (event.type === 'stderr') {
            return {
              ...tab,
              stderr: tab.stderr + event.chunk
            }
          }

          if (event.type === 'stopped') {
            return {
              ...tab,
              isRunning: false,
              currentRunId: null,
              status: `Stopped after ${event.durationMs}ms.`
            }
          }

          if (event.type === 'error') {
            return {
              ...tab,
              isRunning: false,
              currentRunId: null,
              status: `Run failed after ${event.durationMs}ms.`,
              stderr: tab.stderr ? `${tab.stderr}\n${event.message}` : event.message
            }
          }

          if (event.type === 'exit') {
            return {
              ...tab,
              isRunning: false,
              currentRunId: null,
              status: `${describeExitCode(event.exitCode)} ${event.durationMs}ms.`
            }
          }

          return tab
        })
      )
    })

    return unsubscribe
  }, [languages])

  useEffect(() => {
    if (!bootstrappedRef.current || !autoRun || !activeTab) {
      return
    }

    const timer = window.setTimeout(() => {
      void runCode(activeTab.id)
    }, AUTO_RUN_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [autoRun, activeTab?.code, activeTab?.languageId, activeTab?.id, timeoutMs])

  function updateActiveTab(
    updater: (tab: WorkspaceTab) => WorkspaceTab,
    fallbackMessage?: string
  ): void {
    if (!activeTabId) {
      return
    }

    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === activeTabId ? updater(tab) : tab))
    )

    if (fallbackMessage) {
      setWorkspaceMessage(fallbackMessage)
    }
  }

  function handleDividerPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!splitPaneRef.current || window.innerWidth <= 1180) {
      return
    }

    event.preventDefault()

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      if (!splitPaneRef.current) {
        return
      }

      const bounds = splitPaneRef.current.getBoundingClientRect()
      const nextWidth = ((moveEvent.clientX - bounds.left) / bounds.width) * 100

      setEditorWidthPercent(normalizeEditorWidth(nextWidth))
    }

    const handlePointerUp = (): void => {
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    handlePointerMove(event.nativeEvent)
  }

  function handleLanguageChange(languageId: string): void {
    const nextLanguage = languages.find((language) => language.id === languageId)

    if (!nextLanguage) {
      return
    }

    updateActiveTab((tab) => ({
      ...tab,
      languageId,
      code: tab.code.trim() ? tab.code : nextLanguage.template,
      status: `Language set to ${nextLanguage.displayName}.`
    }))
  }

  function handleCodeChange(nextCode: string): void {
    updateActiveTab((tab) => ({
      ...tab,
      code: nextCode
    }))
  }

  function handleTitleChange(nextTitle: string): void {
    updateActiveTab((tab) => ({
      ...tab,
      title: nextTitle
    }))
  }

  function normalizeActiveTitle(): void {
    updateActiveTab((tab) => ({
      ...tab,
      title: tab.title.trim() || 'Untitled'
    }))
  }

  function createNewTab(): void {
    const baseLanguage = selectedLanguage ?? languages[0]

    if (!baseLanguage) {
      return
    }

    const nextTab = createWorkspaceTab(baseLanguage, getNextTabTitle(tabs))

    setTabs((currentTabs) => [...currentTabs, nextTab])
    setActiveTabId(nextTab.id)
    setWorkspaceMessage(`${nextTab.title} created.`)
  }

  async function closeTab(tabId: string): Promise<void> {
    const tabToClose = tabs.find((tab) => tab.id === tabId)

    if (!tabToClose) {
      return
    }

    if (tabToClose.currentRunId) {
      await window.runbox.stopRun().catch(() => undefined)
    }

    const remainingTabs = tabs.filter((tab) => tab.id !== tabId)
    const isClosingActiveTab = activeTabId === tabId

    if (remainingTabs.length === 0) {
      const baseLanguage = languages[0]

      if (!baseLanguage) {
        return
      }

      const fallbackTab = createWorkspaceTab(baseLanguage, 'Script 1')
      setTabs([fallbackTab])
      setActiveTabId(fallbackTab.id)
      setWorkspaceMessage(`${tabToClose.title || 'Tab'} closed. Fresh tab created.`)
      return
    }

    if (isClosingActiveTab) {
      const closedIndex = tabs.findIndex((tab) => tab.id === tabId)
      const nextActiveTab =
        remainingTabs[closedIndex] ?? remainingTabs[closedIndex - 1] ?? remainingTabs[0]

      setActiveTabId(nextActiveTab.id)
    }

    setTabs(remainingTabs)
    setWorkspaceMessage(`${tabToClose.title || 'Tab'} closed.`)
  }

  async function runCode(targetTabId = activeTabId): Promise<void> {
    const targetTab = tabs.find((tab) => tab.id === targetTabId)

    if (!targetTab) {
      return
    }

    pendingRunTabIdRef.current = targetTabId

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === targetTabId
          ? {
              ...tab,
              status: 'Booting runner...'
            }
          : tab
      )
    )

    try {
      await window.runbox.runCode({
        languageId: targetTab.languageId,
        code: targetTab.code,
        timeoutMs
      })
    } catch (error) {
      pendingRunTabIdRef.current = null

      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === targetTabId
            ? {
                ...tab,
                isRunning: false,
                currentRunId: null,
                status: 'Unable to start the runner.',
                stderr: String(error)
              }
            : tab
        )
      )
    }
  }

  async function stopCode(): Promise<void> {
    await window.runbox.stopRun()
  }

  return (
    <main className="shell">
      <section className="workspace">
        <header className="toolbar">
          <div className="brand-block">
            <div className="brand-heading">
              <span className="brand-mark">R</span>
              <div className="brand-copy">
                <h1>Runbox</h1>
              </div>
            </div>
          </div>

          <div className="controls-panel">
            <div className="controls">
              <label className="control">
                <span>Language</span>
                <select
                  value={selectedLanguage?.id ?? ''}
                  onChange={(event) => handleLanguageChange(event.target.value)}
                  disabled={!activeTab}
                >
                  {languages.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="control toggle">
                <span>Auto run</span>
                <button
                  type="button"
                  className={autoRun ? 'toggle-button is-active' : 'toggle-button'}
                  onClick={() => setAutoRun((current) => !current)}
                >
                  {autoRun ? 'On' : 'Off'}
                </button>
              </label>

              <label className="control">
                <span>Timeout</span>
                <select
                  value={String(timeoutMs)}
                  onChange={(event) => setTimeoutMs(Number(event.target.value))}
                >
                  <option value="2000">2s</option>
                  <option value="4000">4s</option>
                  <option value="8000">8s</option>
                </select>
              </label>

              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => void stopCode()}>
                  Stop
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void runCode()}
                >
                  Run now
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="split-pane" ref={splitPaneRef} style={splitPaneStyle}>
          <article className="pane pane-editor">
            <div className="pane-header">
              <div>
                <p className="pane-kicker">Editor</p>
                <p className="pane-title">Source</p>
                <p className="pane-subtitle">
                  Tabs persist locally, so reopening the app restores your workspace.
                </p>
              </div>

              <label className="title-field">
                <span>Tab name</span>
                <input
                  type="text"
                  value={activeTab?.title ?? ''}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  onBlur={normalizeActiveTitle}
                  placeholder="Untitled"
                  disabled={!activeTab}
                />
              </label>
            </div>

            <div className="editor-shell">
              <div className="tab-strip">
                <div className="tab-list">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={tab.id === activeTabId ? 'tab-chip is-active' : 'tab-chip'}
                    >
                      <button
                        type="button"
                        className="tab-trigger"
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        <span className="tab-name">{tab.title.trim() || 'Untitled'}</span>
                        <span className="tab-meta">
                          {getLanguageLabel(tab.languageId, languages)}
                          {tab.isRunning ? ' · Running' : ''}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="tab-close"
                        aria-label={`Close ${tab.title.trim() || 'Untitled'}`}
                        onClick={() => void closeTab(tab.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button type="button" className="tab-add" onClick={createNewTab}>
                  + New tab
                </button>
              </div>

              <div className="editor-frame">
                <Editor
                  height="100%"
                  path={`${activeTab?.id ?? 'workspace'}.${selectedLanguage?.extension ?? 'txt'}`}
                  language={selectedLanguage?.monacoLanguage ?? 'javascript'}
                  value={activeTab?.code ?? ''}
                  beforeMount={handleEditorWillMount}
                  onChange={(nextValue) => handleCodeChange(nextValue ?? '')}
                  theme="runbox-night"
                  options={{
                    automaticLayout: true,
                    fontFamily: 'IBM Plex Mono, Iosevka, SFMono-Regular, Consolas, monospace',
                    fontSize: 15,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    lineNumbersMinChars: 3,
                    minimap: { enabled: false },
                    padding: { top: 20, bottom: 20 },
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    stickyScroll: { enabled: false },
                    wordWrap: 'on'
                  }}
                />
              </div>
            </div>
          </article>

          <div
            className="divider"
            aria-label="Resize panels"
            aria-orientation="vertical"
            role="separator"
            onPointerDown={handleDividerPointerDown}
          />

          <article className="pane pane-output">
            <div className="pane-header">
              <div>
                <p className="pane-kicker">Console</p>
                <p className="pane-title">Output</p>
                <p className="pane-subtitle">
                  Stdout and stderr stay attached to the active tab while the app is open.
                </p>
              </div>
            </div>

            <div className="output-grid">
              <section className="output-card">
                <div className="output-label">stdout</div>
                <pre>{activeTab?.stdout || 'No stdout yet.'}</pre>
              </section>

              <section className="output-card error">
                <div className="output-label">stderr</div>
                <pre>{activeTab?.stderr || 'No stderr yet.'}</pre>
              </section>
            </div>
          </article>
        </section>
      </section>
    </main>
  )
}
