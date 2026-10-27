export interface Clock {
  now(): number
  subscribe(listener: () => void): () => void
  subscribeHeartbeat(listener: () => void): () => void
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
  let currentNow = Date.now()

  const refreshNow = (listener: () => void) => {
    currentNow = Date.now()
    listener()
  }

  const watchPageVisibility = (listener: () => void) => {
    const onVisibilityChange = () => refreshNow(listener)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onVisibilityChange)
    }
  }

  return {
    clock: {
      now: () => currentNow,
      subscribe: (listener) => {
        const interval = window.setInterval(
          () => refreshNow(listener),
          1000,
        )
        const stopWatching = watchPageVisibility(listener)

        return () => {
          window.clearInterval(interval)
          stopWatching()
        }
      },
      subscribeHeartbeat: watchPageVisibility,
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
