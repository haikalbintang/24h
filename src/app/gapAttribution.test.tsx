import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { STATE_STORAGE_KEY } from '@/data/persistence'
import { createBrowserRuntime } from '@/data/runtime'
import { createFakeStorage } from '@/testing/runtime'
import { renderApp } from '@/testing/renderApp'

const SECOND_MS = 1000
const HEARTBEAT_MS = 60 * SECOND_MS
const at = (iso: string) => new Date(iso).getTime()

function setup(now = at('2026-03-08T05:30:00.000Z'), storage = createFakeStorage()) {
  return renderApp({ now, storage })
}

async function createLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  colour = 'Blue',
) {
  // The create-label form lives behind the "New label" toggle.
  await user.click(screen.getByRole('button', { name: 'New label' }))

  const form = screen.getByRole('form', { name: 'Create label' })

  await user.type(
    within(form).getByRole('textbox', { name: 'New label name' }),
    name,
  )
  await user.click(within(form).getByRole('radio', { name: colour }))
  await user.click(within(form).getByRole('button', { name: 'Create label' }))
}

const status = () => screen.getByRole('status', { name: 'Active label' })
const dayClock = () => screen.getByRole('timer', { name: 'Day clock' })
const blocksList = () => screen.getByRole('list', { name: 'Blocks' })
const blockItems = () => within(blocksList()).getAllByRole('listitem')

const readStoredState = (storage: { getItem(key: string): string | null }) => {
  const raw = storage.getItem(STATE_STORAGE_KEY)
  const parsed = JSON.parse(raw ?? 'null')
  const shared = parsed?.shared ?? parsed
  return {
    ...shared,
    lastSeen: shared?.heartbeat ?? shared?.lastSeen,
  } as {
    blocks: { end: number | null }[]
    activeLabelId: string | null
    lastSeen: number
  }
}

describe('Heartbeat and gap attribution', () => {
  describe('Heartbeat', () => {
    it('writes the last-seen heartbeat about every minute while a Block is open', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))

      act(() => first.runtime.clock.advance(HEARTBEAT_MS))

      expect(readStoredState(storage).lastSeen).toBe(
        at('2026-03-08T05:31:00.000Z'),
      )
    })

    it('writes last-seen once a minute rather than on every tick', async () => {
      const storage = createFakeStorage()
      const setItem = vi.spyOn(storage, 'setItem')
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))
      setItem.mockClear()

      act(() => first.runtime.clock.advance(5 * SECOND_MS))
      expect(setItem).not.toHaveBeenCalled()

      act(() => first.runtime.clock.advance(55 * SECOND_MS))
      expect(setItem).toHaveBeenCalledTimes(1)
      expect(readStoredState(storage).lastSeen).toBe(
        at('2026-03-08T05:31:00.000Z'),
      )
    })

    it('writes a heartbeat on page hide while a Block is open', async () => {
      let timestamp = at('2026-03-08T05:30:00.000Z')
      const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => timestamp)

      try {
        window.localStorage.clear()
        const runtime = createBrowserRuntime()
        const user = userEvent.setup()
        const view = render(<App runtime={runtime} />)

        await createLabel(user, 'Work')
        await user.click(screen.getByRole('button', { name: 'Work' }))

        // Observe storage while the pagehide handlers run, before React
        // effects flush: a real unload never gets to run those effects.
        let storedDuringPageHide: number | null = null
        const observePageHide = () => {
          storedDuringPageHide = readStoredState(runtime.storage).lastSeen
        }
        window.addEventListener('pagehide', observePageHide)

        act(() => {
          timestamp += 45 * SECOND_MS
          window.dispatchEvent(new Event('pagehide'))
        })

        window.removeEventListener('pagehide', observePageHide)

        expect(storedDuringPageHide).toBe(at('2026-03-08T05:30:45.000Z'))

        const stored = readStoredState(runtime.storage)

        expect(stored.lastSeen).toBe(at('2026-03-08T05:30:45.000Z'))

        view.unmount()
      } finally {
        dateNow.mockRestore()
      }
    })

    it('writes a heartbeat on a visibility change while a Block is open', async () => {
      let timestamp = at('2026-03-08T05:30:00.000Z')
      const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => timestamp)

      try {
        window.localStorage.clear()
        const runtime = createBrowserRuntime()
        const user = userEvent.setup()
        const view = render(<App runtime={runtime} />)

        await createLabel(user, 'Work')
        await user.click(screen.getByRole('button', { name: 'Work' }))

        act(() => {
          timestamp += 45 * SECOND_MS
          document.dispatchEvent(new Event('visibilitychange'))
        })

        const stored = readStoredState(runtime.storage)

        expect(stored.lastSeen).toBe(at('2026-03-08T05:30:45.000Z'))

        view.unmount()
      } finally {
        dateNow.mockRestore()
      }
    })
  })

  describe('Gap attribution', () => {
    it('keeps the Label and extends the open Block when the gap since the last heartbeat exceeds two minutes', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))
      first.view.unmount()

      setup(at('2026-03-08T08:30:00.000Z'), storage)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(status()).toHaveTextContent('Work')

      const items = blockItems()
      expect(items).toHaveLength(1)
      expect(items[0]).toHaveTextContent(/ongoing/i)
      expect(items[0]).toHaveTextContent('03:00:00')

      expect(dayClock()).toHaveTextContent('03:30:00')
      expect(readStoredState(storage).blocks[0]?.end).toBeNull()
    })

    it('keeps the Label when the gap since the last heartbeat is under two minutes', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))

      first.view.unmount()

      setup(at('2026-03-08T05:31:30.000Z'), storage)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(status()).toHaveTextContent('Work')
      expect(blockItems()[0]).toHaveTextContent(/ongoing/i)
      expect(readStoredState(storage).blocks[0]?.end).toBeNull()
    })

    it('keeps the Label when the gap is exactly two minutes', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))
      first.view.unmount()

      setup(at('2026-03-08T05:32:00.000Z'), storage)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(status()).toHaveTextContent('Work')
      expect(blockItems()[0]).toHaveTextContent(/ongoing/i)
    })

    it('advances the Heartbeat to the present on load so the gap is not re-detected', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))
      first.view.unmount()

      setup(at('2026-03-08T08:30:00.000Z'), storage)

      expect(readStoredState(storage).lastSeen).toBe(
        at('2026-03-08T08:30:00.000Z'),
      )
    })

    it('splits the kept Block at the Day boundary crossed during the gap', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T05:30:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))

      act(() => first.runtime.clock.advance(60 * SECOND_MS))

      first.view.unmount()

      setup(at('2026-03-09T06:30:00.000Z'), storage)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(status()).toHaveTextContent('Work')

      const items = blockItems()
      expect(items).toHaveLength(1)
      expect(items[0]).toHaveTextContent('Work')
      expect(items[0]).toHaveTextContent('00:00:00 – Ongoing')
      expect(items[0]).toHaveTextContent('01:30:00')

      // The open Block is stored unsplit; per-Day splitting is derived.
      const stored = readStoredState(storage)
      expect(stored.blocks).toHaveLength(1)
      expect(stored.blocks[0]?.end).toBeNull()
    })

    it('does not create a zero-length Block when the gap crosses a Day boundary', async () => {
      const storage = createFakeStorage()
      const first = setup(at('2026-03-08T04:59:00.000Z'), storage)
      const user = first.user

      await createLabel(user, 'Work')
      await user.click(screen.getByRole('button', { name: 'Work' }))

      act(() => first.runtime.clock.advance(60 * SECOND_MS))

      first.view.unmount()

      setup(at('2026-03-08T05:10:00.000Z'), storage)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(status()).toHaveTextContent('Work')

      const items = blockItems()
      expect(items).toHaveLength(1)
      expect(items[0]).toHaveTextContent('Work')
      expect(items[0]).toHaveTextContent('00:00:00 – Ongoing')
      expect(items[0]).toHaveTextContent('00:10:00')

      const stored = readStoredState(storage)
      expect(stored.blocks).toHaveLength(1)
      expect(stored.blocks[0]?.end).toBeNull()
    })
  })
})
