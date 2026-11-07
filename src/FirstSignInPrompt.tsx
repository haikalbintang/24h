import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { FirstSignInChoice } from './sync'

interface FirstSignInPromptProps {
  email: string | null
  onResolve: (choice: FirstSignInChoice) => void
}

const primaryButtonClass =
  'rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600'

const dangerButtonClass =
  'rounded-lg bg-red-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400'

const secondaryButtonClass =
  'rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600'

export default function FirstSignInPrompt({
  email,
  onResolve,
}: FirstSignInPromptProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [choice, setChoice] = useState<FirstSignInChoice>('merge')
  const [confirming, setConfirming] = useState(false)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return
    }

    const container = dialogRef.current
    if (container === null) {
      return
    }

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !(el as HTMLButtonElement).disabled)

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (first === undefined || last === undefined) {
      return
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
      return
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-[rgba(0,0,0,0.8)] p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="First sign-in"
        aria-describedby="first-sign-in-description"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-neutral-50">
          Combine with this Account?
        </h2>

        {confirming ? (
          <div className="mt-4 space-y-4">
            <p id="first-sign-in-description" className="text-sm text-neutral-300">
              Replacing discards the Shared state on this device and keeps only
              what {email ?? 'the Account'} already has. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirming(false)}
                className={secondaryButtonClass}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => onResolve('replace')}
                className={dangerButtonClass}
              >
                Confirm replace
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p id="first-sign-in-description" className="text-sm text-neutral-300">
              {email ?? 'This Account'} already has data, and so does this
              device.
            </p>
            <div role="radiogroup" aria-label="First sign-in choice" className="space-y-3">
              <label
                htmlFor="first-sign-in-merge"
                className="flex cursor-pointer items-start gap-3 text-sm text-neutral-200"
              >
                <input
                  id="first-sign-in-merge"
                  type="radio"
                  name="first-sign-in-choice"
                  value="merge"
                  autoFocus
                  checked={choice === 'merge'}
                  onChange={() => setChoice('merge')}
                  className="mt-1 accent-neutral-300"
                />
                <span>
                  <span className="font-semibold">Merge (default)</span>
                  <span className="block text-xs text-neutral-400">
                    Combine both, keeping the earliest Anchor.
                  </span>
                </span>
              </label>
              <label
                htmlFor="first-sign-in-replace"
                className="flex cursor-pointer items-start gap-3 text-sm text-neutral-200"
              >
                <input
                  id="first-sign-in-replace"
                  type="radio"
                  name="first-sign-in-choice"
                  value="replace"
                  checked={choice === 'replace'}
                  onChange={() => setChoice('replace')}
                  className="mt-1 accent-neutral-300"
                />
                <span>
                  <span className="font-semibold">Replace</span>
                  <span className="block text-xs text-neutral-400">
                    Keep the Account&apos;s data and discard this device&apos;s.
                  </span>
                </span>
              </label>
            </div>
            <button
              type="button"
              onClick={() =>
                choice === 'replace' ? setConfirming(true) : onResolve('merge')
              }
              className={primaryButtonClass}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
