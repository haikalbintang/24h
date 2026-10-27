import type { Clock, ExportSink, Runtime, Storage } from '../runtime'

export interface FakeClock extends Clock {
  setNow(now: number): void
  advance(ms: number): void
}

export function createFakeClock(initialNow: number): FakeClock {
  let currentNow = initialNow
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    now: () => currentNow,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    // Heartbeats come from browser events; those tests use createBrowserRuntime.
    subscribeHeartbeat: () => () => {},
    setNow: (now) => {
      currentNow = now
      notify()
    },
    advance: (ms) => {
      currentNow += ms
      notify()
    },
  }
}

export function createFakeStorage(
  initialValues: Record<string, string> = {},
): Storage {
  const values = new Map(Object.entries(initialValues))

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

export interface ExportCall {
  filename: string
  mimeType: string
  contents: string
}

export interface CapturingExportSink extends ExportSink {
  readonly calls: ExportCall[]
}

export function createCapturingExportSink(): CapturingExportSink {
  const calls: ExportCall[] = []

  return {
    calls,
    save: (filename, mimeType, contents) => {
      calls.push({ filename, mimeType, contents })
    },
  }
}

export interface TestRuntime extends Runtime {
  clock: FakeClock
  storage: Storage
  exportSink: CapturingExportSink
}

export function createTestRuntime(
  now: number,
  storage: Storage = createFakeStorage(),
): TestRuntime {
  return {
    clock: createFakeClock(now),
    storage,
    exportSink: createCapturingExportSink(),
  }
}
