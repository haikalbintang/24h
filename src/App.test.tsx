import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createFakeStorage, createTestRuntime } from './test/runtime'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const at = (iso: string) => new Date(iso).getTime()
const dayClock = () => screen.getByRole('timer', { name: 'Day clock' })

describe('Day clock', () => {
  it('shows elapsed time since the local midnight before first launch', () => {
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'))

    render(<App runtime={runtime} />)

    expect(dayClock()).toHaveTextContent('00:30:00')
    expect(screen.getByText('Mar 8, 2026')).toBeInTheDocument()
  })

  it('renders a dark dashboard', () => {
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'))

    render(<App runtime={runtime} />)

    expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'dark')
  })

  it('ticks every second', () => {
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'))

    render(<App runtime={runtime} />)

    act(() => runtime.clock.advance(SECOND_MS))
    expect(dayClock()).toHaveTextContent('00:30:01')

    act(() => runtime.clock.advance(SECOND_MS))
    expect(dayClock()).toHaveTextContent('00:30:02')
  })

  it('runs from 00:00:00 to 23:59:59 and rolls into the next Day', () => {
    const runtime = createTestRuntime(at('2026-03-08T05:00:00.000Z'))

    render(<App runtime={runtime} />)

    expect(dayClock()).toHaveTextContent('00:00:00')

    act(() => runtime.clock.advance(DAY_MS - SECOND_MS))
    expect(dayClock()).toHaveTextContent('23:59:59')

    act(() => runtime.clock.advance(SECOND_MS))
    expect(dayClock()).toHaveTextContent('00:00:00')
    expect(screen.getByText('Mar 9, 2026')).toBeInTheDocument()
  })

  it('keeps the Anchor across reloads and drifts the spring-forward boundary', () => {
    const storage = createFakeStorage()
    const firstRuntime = createTestRuntime(
      at('2026-03-08T05:30:00.000Z'),
      storage,
    )
    const firstRender = render(<App runtime={firstRuntime} />)

    expect(dayClock()).toHaveTextContent('00:30:00')

    firstRender.unmount()

    const secondRuntime = createTestRuntime(
      at('2026-03-09T04:30:00.000Z'),
      storage,
    )
    render(<App runtime={secondRuntime} />)

    expect(dayClock()).toHaveTextContent('23:30:00')
    expect(screen.getByText('Mar 8, 2026')).toBeInTheDocument()

    act(() => secondRuntime.clock.advance(30 * MINUTE_MS))

    expect(dayClock()).toHaveTextContent('00:00:00')
    expect(screen.getByText('Mar 9, 2026')).toBeInTheDocument()
  })

  it('drifts the fall-back boundary without repeating a Day label', () => {
    const storage = createFakeStorage()
    const firstRuntime = createTestRuntime(
      at('2026-11-01T04:30:00.000Z'),
      storage,
    )
    const firstRender = render(<App runtime={firstRuntime} />)

    expect(dayClock()).toHaveTextContent('00:30:00')
    expect(screen.getByText('Nov 1, 2026')).toBeInTheDocument()

    firstRender.unmount()

    const secondRuntime = createTestRuntime(
      at('2026-11-02T03:30:00.000Z'),
      storage,
    )
    render(<App runtime={secondRuntime} />)

    expect(dayClock()).toHaveTextContent('23:30:00')
    expect(screen.getByText('Nov 1, 2026')).toBeInTheDocument()

    act(() => secondRuntime.clock.advance(30 * MINUTE_MS))

    expect(dayClock()).toHaveTextContent('00:00:00')
    expect(screen.getByText('Nov 2, 2026')).toBeInTheDocument()
  })

  it('keeps the clock within one Day after a jump longer than a Day', () => {
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'))

    render(<App runtime={runtime} />)

    act(() => runtime.clock.advance(30 * HOUR_MS))

    expect(dayClock()).toHaveTextContent('06:30:00')
    expect(screen.getByText('Mar 9, 2026')).toBeInTheDocument()
  })
})
