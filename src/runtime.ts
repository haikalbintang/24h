export interface Clock {
  now(): number
  subscribe(listener: () => void): () => void
}

export interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ExportSink {
  save(filename: string, mimeType: string, contents: string): void
}

export interface Runtime {
  clock: Clock
  storage: Storage
  exportSink: ExportSink
}

export function createBrowserRuntime(): Runtime {
  return {
    clock: {
      now: () => Date.now(),
      subscribe: (listener) => {
        const interval = window.setInterval(listener, 1000)

        const onVisibilityChange = () => {
          listener()
        }

        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
          window.clearInterval(interval)
          document.removeEventListener('visibilitychange', onVisibilityChange)
        }
      },
    },
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => {
        window.localStorage.setItem(key, value)
      },
    },
    exportSink: {
      save: (filename, mimeType, contents) => {
        const url = URL.createObjectURL(new Blob([contents], { type: mimeType }))
        const anchor = document.createElement('a')

        anchor.href = url
        anchor.download = filename
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      },
    },
  }
}
