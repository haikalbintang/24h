import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { AccountSession, Auth } from '@/data/auth'
import HandoffQrCode from './HandoffQrCode'

interface AccountScreenProps {
  session: AccountSession | null
  handoffReady?: boolean
  auth: Auth
  onClose: () => void
  onSignOut: () => void
}

export default function AccountScreen({
  session,
  handoffReady = false,
  auth,
  onClose,
  onSignOut,
}: AccountScreenProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [email, setEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [handoffLinkSent, setHandoffLinkSent] = useState(false)
  const [handoff, setHandoff] = useState<{
    status: 'idle' | 'ready' | 'error'
    url?: string
    error?: string
  }>({ status: 'idle' })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!session || !handoffReady) {
      return
    }

    let cancelled = false

    void auth
      .createHandoff()
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.error || !result.url) {
          setHandoff({
            status: 'error',
            error: result.error ?? 'Could not create a Device handoff link.',
          })
          return
        }
        setHandoff({ status: 'ready', url: result.url })
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setHandoff({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      })

    return () => {
      cancelled = true
    }
  }, [auth, session, handoffReady])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }

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

  const runAuthAction = async (
    action: () => Promise<{ error?: string } | undefined>,
    onSuccess?: () => void,
  ) => {
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await action()
      if (result?.error) {
        setErrorMessage(result.error)
      } else {
        onSuccess?.()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleMagicLinkSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      return
    }
    await runAuthAction(
      () => auth.signInWithMagicLink(trimmed),
      () => setMagicLinkSent(true),
    )
  }

  const handleGoogleSignIn = async () => {
    if (!auth.signInWithGoogle) {
      return
    }
    await runAuthAction(() => auth.signInWithGoogle!())
  }

  const handleSignOutClick = async () => {
    await runAuthAction(() => auth.signOut(), onSignOut)
  }

  const handleHandoffClick = async () => {
    if (!session || !handoffReady) {
      return
    }
    await runAuthAction(
      () => auth.sendHandoffMagicLink(session.email),
      () => setHandoffLinkSent(true),
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-[rgba(0,0,0,0.8)] p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <h2 id="account-dialog-title" className="text-lg font-semibold text-neutral-50">
            Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
          >
            Close
          </button>
        </div>

        {session ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-neutral-300">
              Signed in as{' '}
              <span className="font-semibold text-neutral-100">
                {session.email}
              </span>
            </p>
            <div className="space-y-3 border-t border-neutral-800 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Device handoff
              </h3>
              <p className="text-xs text-neutral-400">
                Scan this QR code with your phone camera to sign in to this
                Account and its Shared state, or send a magic link to your
                email.
              </p>
              {handoffReady ? (
                handoff.status === 'ready' && handoff.url ? (
                  <div className="flex flex-col items-center gap-2">
                    <HandoffQrCode url={handoff.url} />
                    <p className="text-center text-xs text-neutral-500">
                      The code expires shortly and works once.
                    </p>
                  </div>
                ) : handoff.status === 'error' ? (
                  <p role="alert" className="text-xs text-red-400">
                    {handoff.error}
                  </p>
                ) : (
                  <p role="status" className="text-xs text-neutral-400">
                    Generating QR code…
                  </p>
                )
              ) : (
                <p className="text-xs text-neutral-500">
                  Waiting for initial sync before creating a handoff link.
                </p>
              )}
              {handoffLinkSent ? (
                <div
                  role="status"
                  className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs text-neutral-200"
                >
                  Check your email on the other device for the magic link.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleHandoffClick}
                  disabled={!handoffReady || submitting}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:opacity-50"
                >
                  {handoffReady
                    ? 'Send magic link to email'
                    : 'Completing initial sync…'}
                </button>
              )}
            </div>
            <p className="border-t border-neutral-800 pt-4 text-xs text-neutral-400">
              Signing out keeps the local copy on this device and stops syncing.
            </p>
            {errorMessage ? (
              <p role="alert" className="text-xs text-red-400">
                {errorMessage}
              </p>
            ) : null}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSignOutClick}
                disabled={submitting}
                className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <p className="text-xs text-neutral-400">
              Sign in to keep your timeline in sync across devices. Without an
              Account, your data stays on this device.
            </p>

            {magicLinkSent ? (
              <div
                role="status"
                className="rounded-lg border border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-200"
              >
                Check your email for the magic link to finish signing in.
              </div>
            ) : (
              <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="account-email"
                    className="block text-xs font-medium uppercase tracking-wider text-neutral-400"
                  >
                    Email
                  </label>
                  <input
                    id="account-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    required
                    autoFocus
                    aria-invalid={errorMessage !== null}
                    aria-describedby={
                      errorMessage ? 'account-email-error' : undefined
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                  />
                </div>
                {errorMessage ? (
                  <p
                    id="account-email-error"
                    role="alert"
                    className="text-xs text-red-400"
                  >
                    {errorMessage}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:opacity-50"
                >
                  Send magic link
                </button>
              </form>
            )}

            {auth.isGoogleConfigured ? (
              <div className="border-t border-neutral-800 pt-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:opacity-50"
                >
                  Sign in with Google
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
