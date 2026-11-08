import type { SharedState } from '@/data/persistence'
import type { RemoteDocument, SyncAdapter, SyncPullResult, SyncPushResult } from '@/data/sync'

export interface FakeSyncCall {
  method: 'pull' | 'push'
  accountId: string
  shared?: SharedState
  baseVersion?: number | null
}

export interface FakeSyncAdapter extends SyncAdapter {
  readonly calls: FakeSyncCall[]
  setOffline(offline: boolean): void
  isOffline(): boolean
  getRemoteDocument(accountId: string): RemoteDocument | null
  setRemoteDocument(accountId: string, doc: RemoteDocument | null): void
}

export interface FakeSyncOptions {
  initialDocuments?: Record<string, RemoteDocument>
  initialOffline?: boolean
}

export function createFakeSyncAdapter(
  options: FakeSyncOptions = {},
): FakeSyncAdapter {
  const documents = new Map<string, RemoteDocument>(
    Object.entries(options.initialDocuments ?? {}),
  )
  let offline = options.initialOffline ?? false
  const calls: FakeSyncCall[] = []

  return {
    calls,
    setOffline: (value: boolean) => {
      offline = value
    },
    isOffline: () => offline,
    getRemoteDocument: (accountId: string) => documents.get(accountId) ?? null,
    setRemoteDocument: (accountId: string, doc: RemoteDocument | null) => {
      if (doc === null) {
        documents.delete(accountId)
      } else {
        documents.set(accountId, doc)
      }
    },
    pull: async (accountId: string): Promise<SyncPullResult> => {
      calls.push({ method: 'pull', accountId })
      if (offline) {
        return { status: 'offline', error: 'Network unavailable' }
      }
      const doc = documents.get(accountId) ?? null
      return { status: 'success', document: doc }
    },
    push: async (
      accountId: string,
      shared: SharedState,
      baseVersion: number | null,
    ): Promise<SyncPushResult> => {
      calls.push({ method: 'push', accountId, shared, baseVersion })
      if (offline) {
        return { status: 'offline', error: 'Network unavailable' }
      }

      const existing = documents.get(accountId)
      if (existing) {
        if (baseVersion !== existing.version) {
          // Version conflict!
          return { status: 'conflict', remote: existing }
        }
        const newVersion = existing.version + 1
        const newDoc: RemoteDocument = { version: newVersion, shared }
        documents.set(accountId, newDoc)
        return { status: 'success', document: newDoc }
      } else {
        // First push
        const newDoc: RemoteDocument = { version: 1, shared }
        documents.set(accountId, newDoc)
        return { status: 'success', document: newDoc }
      }
    },
  }
}
