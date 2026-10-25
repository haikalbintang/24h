import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createTestRuntime } from './test/runtime'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

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

const blocksList = () => screen.getByRole('list', { name: 'Blocks' })
const blockItems = () => within(blocksList()).getAllByRole('listitem')

describe('Blocks', () => {
  it('opens a Block at the current second when a label is chosen', async () => {
    const { user } = setup()

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    expect(blockItems()).toHaveLength(1)
    expect(blockItems()[0]).toHaveTextContent('Work')
    expect(blockItems()[0]).toHaveTextContent('00:30:00')
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i)
    expect(blockItems()[0]).toHaveTextContent('00:00:00')
  })

  it('shows a live duration for the ongoing Block', async () => {
    const { runtime, user } = setup()

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    act(() => runtime.clock.advance(5 * SECOND_MS))

    expect(blockItems()[0]).toHaveTextContent('00:00:05')
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i)
  })

  it('closes the current Block and opens the next at the same instant when switching', async () => {
    const { runtime, user } = setup()

    await createLabel(user, 'Work')
    await createLabel(user, 'Rest', 'Green')

    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(10 * SECOND_MS))
    await user.click(screen.getByRole('button', { name: 'Rest' }))

    const items = blockItems()

    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Work')
    expect(items[0]).toHaveTextContent('00:30:00')
    expect(items[0]).toHaveTextContent('00:30:10')
    expect(items[0]).not.toHaveTextContent(/ongoing/i)

    expect(items[1]).toHaveTextContent('Rest')
    expect(items[1]).toHaveTextContent('00:30:10')
    expect(items[1]).toHaveTextContent(/ongoing/i)
  })

  it('closes the Block and adds no Block when deselecting', async () => {
    const { runtime, user } = setup()

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(5 * SECOND_MS))
    await user.click(screen.getByRole('button', { name: 'Work' }))

    expect(
      screen.getByRole('status', { name: 'Active label' }),
    ).toHaveTextContent('Unlabeled')
    expect(blockItems()).toHaveLength(1)
    expect(blockItems()[0]).toHaveTextContent('00:00:05')
    expect(blockItems()[0]).not.toHaveTextContent(/ongoing/i)
  })

  it('lists Blocks chronologically with label, start, end, and duration', async () => {
    const { runtime, user } = setup()

    await createLabel(user, 'Work')
    await createLabel(user, 'Rest', 'Green')

    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => runtime.clock.advance(30 * SECOND_MS))
    await user.click(screen.getByRole('button', { name: 'Rest' }))
    act(() => runtime.clock.advance(15 * SECOND_MS))

    const items = blockItems()

    expect(items[0]).toHaveTextContent('Work')
    expect(items[0]).toHaveTextContent('00:30:00')
    expect(items[0]).toHaveTextContent('00:30:30')
    expect(items[0]).toHaveTextContent('00:00:30')

    expect(items[1]).toHaveTextContent('Rest')
    expect(items[1]).toHaveTextContent('00:30:30')
    expect(items[1]).toHaveTextContent(/ongoing/i)
    expect(items[1]).toHaveTextContent('00:00:15')
  })

  it('updates its Blocks when a label is renamed and recoloured', async () => {
    const { user } = setup()

    await createLabel(user, 'Work', 'Blue')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    await user.click(screen.getByRole('button', { name: 'Edit Work' }))

    const form = screen.getByRole('form', { name: 'Edit Work' })
    const nameInput = within(form).getByRole('textbox', { name: 'Label name' })

    await user.clear(nameInput)
    await user.type(nameInput, 'Focus')
    await user.click(within(form).getByRole('radio', { name: 'Amber' }))
    await user.click(
      within(form).getByRole('button', { name: 'Save changes' }),
    )

    expect(blockItems()[0]).toHaveTextContent('Focus')
    expect(blockItems()[0]).toHaveAccessibleDescription('Amber')
  })

  it('ends the Block at a Day boundary and resumes under the same label', async () => {
    const { runtime, user } = setup(at('2026-03-10T03:59:59.000Z'))

    expect(screen.getByRole('timer', { name: 'Day clock' })).toHaveTextContent(
      '23:59:59',
    )

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    expect(blockItems()[0]).toHaveTextContent('23:59:59')

    act(() => runtime.clock.advance(SECOND_MS))

    expect(screen.getByRole('timer', { name: 'Day clock' })).toHaveTextContent(
      '00:00:00',
    )
    expect(blockItems()).toHaveLength(1)
    expect(blockItems()[0]).toHaveTextContent('Work')
    expect(blockItems()[0]).toHaveTextContent('00:00:00 – Ongoing')
    expect(blockItems()[0]).toHaveTextContent('00:00:00')

    act(() => runtime.clock.advance(SECOND_MS))

    expect(blockItems()[0]).toHaveTextContent('00:00:00 – Ongoing')
    expect(blockItems()[0]).toHaveTextContent('00:00:01')
  })

  it('splits across every Day boundary when the clock jumps', async () => {
    const { runtime, user } = setup()

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    act(() => runtime.clock.advance(54 * HOUR_MS))

    expect(screen.getByRole('timer', { name: 'Day clock' })).toHaveTextContent(
      '06:30:00',
    )
    expect(screen.getByText('Mar 10, 2026')).toBeInTheDocument()
    expect(blockItems()).toHaveLength(1)
    expect(blockItems()[0]).toHaveTextContent('00:00:00 – Ongoing')
    expect(blockItems()[0]).toHaveTextContent('06:30:00')
  })

  it('keeps the same Block when its number key is pressed again', async () => {
    const { runtime, user } = setup()

    await createLabel(user, 'Work')
    await createLabel(user, 'Rest', 'Green')

    await user.keyboard('1')
    act(() => runtime.clock.advance(5 * SECOND_MS))
    await user.keyboard('1')

    expect(blockItems()).toHaveLength(1)
    expect(blockItems()[0]).toHaveTextContent('Work')
    expect(blockItems()[0]).toHaveTextContent('00:00:05')
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i)

    await user.keyboard('2')

    expect(blockItems()).toHaveLength(2)
    expect(blockItems()[1]).toHaveTextContent('Rest')
    expect(blockItems()[1]).toHaveTextContent('00:30:05')
    expect(blockItems()[1]).toHaveTextContent(/ongoing/i)
  })
})
