import { useState } from 'react'
import type { FirstSignInChoice } from './sync'

interface FirstSignInPromptProps {
  email: string | null
  onResolve: (choice: FirstSignInChoice) => void
}

const primaryButtonClass =
  'rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600'

const secondaryButtonClass =
  'rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600'

export default function FirstSignInPrompt({
  email,
  onResolve,
}: FirstSignInPromptProps) {
  const [choice, setChoice] = useState<FirstSignInChoice>('merge')
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)] p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="First sign-in"
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-neutral-50">
          Combine with this Account?
        </h2>

        {confirming ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-neutral-300">
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
                className={primaryButtonClass}
              >
                Confirm replace
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-neutral-300">
              {email ?? 'This Account'} already has data, and so does this
              device.
            </p>
            <div role="radiogroup" aria-label="First sign-in choice" className="space-y-3">
              <label className="flex items-start gap-3 text-sm text-neutral-200">
                <input
                  type="radio"
                  name="first-sign-in-choice"
                  value="merge"
                  autoFocus
                  checked={choice === 'merge'}
                  onChange={() => setChoice('merge')}
                />
                <span>
                  <span className="font-semibold">Merge (default)</span>
                  <span className="block text-xs text-neutral-400">
                    Combine both, keeping the earliest Anchor.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-neutral-200">
                <input
                  type="radio"
                  name="first-sign-in-choice"
                  value="replace"
                  checked={choice === 'replace'}
                  onChange={() => setChoice('replace')}
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
