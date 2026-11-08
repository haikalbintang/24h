import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/app/App'
import type { Storage } from '@/data/runtime'
import type { FakeAuthAdapter } from '@/testing/auth'
import type { FakeSyncAdapter } from '@/testing/sync'
import {
  createFakeStorage,
  createTestRuntime,
  type TestRuntime,
} from './runtime'
import { createFakeAuthAdapter } from './auth'
import { createFakeSyncAdapter } from './sync'

export interface RenderAppOptions {
  now?: number
  storage?: Storage
  auth?: FakeAuthAdapter
  sync?: FakeSyncAdapter
}

export interface RenderAppResult {
  runtime: TestRuntime
  user: ReturnType<typeof userEvent.setup>
  view: ReturnType<typeof render>
}

export function renderApp(options: RenderAppOptions = {}): RenderAppResult {
  const now = options.now ?? new Date('2026-03-08T05:30:00.000Z').getTime()
  const storage = options.storage ?? createFakeStorage()
  const auth = options.auth ?? createFakeAuthAdapter()
  const sync = options.sync ?? createFakeSyncAdapter()
  const runtime = createTestRuntime(now, storage, auth, sync)
  const user = userEvent.setup()

  const view = render(<App runtime={runtime} />)

  return { runtime, user, view }
}
