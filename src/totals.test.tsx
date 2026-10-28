import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createTestRuntime } from './test/runtime'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

const at = (iso: string) => new Date(iso).getTime()

function setup(now = at('2026-03-08T05:30:00.000Z')) {
  const runtime = createTestRuntime(now)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user }
}

async function createLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  colour = 'Blue',
) {
  const form = screen.getByRole('form', { name: 'Create label' })

  await user.type(
    within(form).getByRole('textbox', { name: 'New label name' }),
    name,
  )
  await user.click(within(form).getByRole('radio', { name: colour }))
  await user.click(within(form).getByRole('button', { name: 'Create label' }))
}

const selectedDayTotals = () =>
  screen.getByRole('list', { name: 'Selected day totals' })

const sevenDayTotals = () =>
  screen.getByRole('list', { name: 'Seven day totals' })

const timeline = () => screen.getByRole('list', { name: 'Timeline' })

const selectedDayTotalItems = () =>
  within(selectedDayTotals()).getAllByRole('listitem')

describe('Totals', () => {
  it('shows the selected day totals and the Unaccounted total', async () => {
    const { runtime, user } = setup(at('2026-03-08T05:00:00.000Z'))

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * MINUTE_MS))
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * MINUTE_MS))

    const items = selectedDayTotalItems()

    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Work: 00:30:00')
    expect(items[1]).toHaveTextContent('Unaccounted: 00:30:00')
  })

  it('updates the totals as the active Block runs', async () => {
    const { runtime, user } = setup(at('2026-03-08T05:00:00.000Z'))

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    expect(selectedDayTotalItems()[1]).toHaveTextContent('Unaccounted: 00:00:00')

    act(() => runtime.clock.advance(30 * MINUTE_MS))

    expect(selectedDayTotalItems()[0]).toHaveTextContent('Work: 00:30:00')
    expect(selectedDayTotalItems()[1]).toHaveTextContent('Unaccounted: 00:00:00')
  })

  it('shows per-label totals and the Unaccounted total for the selected Day and the previous six Days', async () => {
    const { runtime, user } = setup(at('2026-03-08T05:00:00.000Z'))

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * MINUTE_MS))
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * MINUTE_MS))

    const days = within(sevenDayTotals()).getAllByRole('listitem')

    expect(days).toHaveLength(7)
    expect(days[6]).toHaveTextContent('Day 0')
    expect(days[6]).toHaveTextContent('Work: 00:30:00')
    expect(days[6]).toHaveTextContent('Unaccounted: 00:30:00')
    expect(days[0]).toHaveTextContent('Day -6')
    expect(days[0]).toHaveTextContent('Unaccounted: 24:00:00')
  })

  it('shows label-coloured timeline segments for the selected Day', async () => {
    const { runtime, user } = setup(at('2026-03-08T05:00:00.000Z'))

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * MINUTE_MS))
    await user.click(screen.getByRole('button', { name: 'Work' }))

    const items = within(timeline()).getAllByRole('listitem')
    const segments = items.filter((item) => item.hasAttribute('data-label'))

    expect(segments).toHaveLength(1)
    expect(segments[0]).toHaveAttribute('data-label', 'label-1')
  })

  it('marks future time on the current Day as distinct on the timeline', async () => {
    const { runtime, user } = setup(at('2026-03-08T05:00:00.000Z'))

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * MINUTE_MS))
    await user.click(screen.getByRole('button', { name: 'Work' }))

    const items = within(timeline()).getAllByRole('listitem')
    const future = items.find((item) => item.hasAttribute('data-future'))

    expect(future).toBeDefined()
    expect(future).toHaveAttribute('data-future', 'true')
  })
})
