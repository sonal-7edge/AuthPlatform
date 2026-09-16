/**
 * Asking a question from inside `npm install`.
 *
 * npm runs lifecycle scripts with stdin and stdout piped: `process.stdin.isTTY`
 * is undefined and anything written to stdout is swallowed unless the user
 * passed --foreground-scripts. Both problems disappear by going to the
 * controlling terminal directly — /dev/tty is still the user's real terminal
 * even when the process's own stdio has been redirected.
 *
 * Every failure mode degrades to "no question asked":
 *
 *   no controlling terminal (CI, Docker build, `npm install | tee`)
 *       openSync throws -> openTTY() returns null
 *   a terminal, but nobody is watching
 *       the prompt times out after 30s and the install carries on, having
 *       changed nothing. postinstall stops asking after the first timeout, so
 *       an unattended install is delayed by 30s at most — never wedged.
 *   the user opts out
 *       CI=1 or AUTH_CLIENT_NO_PROMPT=1
 *
 * The timeout is the important one: a package that can wedge someone's install
 * is worse than a package that fails to ask.
 */

import { createReadStream, createWriteStream, openSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** Environments where prompting is either impossible or unwelcome. */
export function promptingDisabled() {
  if (process.env.AUTH_CLIENT_NO_PROMPT) return 'AUTH_CLIENT_NO_PROMPT is set'
  if (process.env.CI) return 'CI is set'
  if (process.env.npm_config_yes) return '--yes was passed to npm'
  return null
}

/**
 * Opens the controlling terminal. Returns null when there isn't one, which is
 * the signal to fall back to leaving a note on disk.
 *
 * @returns {{ write: (s: string) => void, ask: (q: string, opts?: { def?: boolean, timeoutMs?: number }) => Promise<boolean|null>, close: () => void } | null}
 */
export function openTTY() {
  if (promptingDisabled()) return null

  let readFd
  let writeFd
  try {
    readFd = openSync('/dev/tty', 'r')
    writeFd = openSync('/dev/tty', 'w')
  } catch {
    return null
  }

  const input = createReadStream(null, { fd: readFd })
  const output = createWriteStream(null, { fd: writeFd })
  let closed = false

  function close() {
    if (closed) return
    closed = true
    try { input.destroy() } catch { /* already gone */ }
    try { output.end() } catch { /* already gone */ }
  }

  function write(text) {
    if (!closed) output.write(text)
  }

  /**
   * @returns {Promise<boolean|null>} true/false, or null if it timed out or
   * the terminal went away — callers treat null as "unanswered", which is what
   * keeps the step `pending` so the next install can resume from it.
   */
  function ask(question, { def = true, timeoutMs = 30_000 } = {}) {
    if (closed) return Promise.resolve(null)

    const rl = createInterface({ input, output, terminal: true })

    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { rl.close() } catch { /* already closed */ }
        resolve(value)
      }

      const timer = setTimeout(() => {
        write(`\n  no answer in ${Math.round(timeoutMs / 1000)}s — skipping, nothing was changed.\n`)
        finish(null)
      }, timeoutMs)
      // Don't let a pending prompt be the only thing keeping node alive.
      timer.unref?.()

      // Ctrl+C / Ctrl+D at the prompt: unanswered, not "no".
      rl.on('close', () => finish(null))
      rl.question(`  ${question} ${def ? '(Y/n)' : '(y/N)'} `, (answer) => {
        const text = answer.trim().toLowerCase()
        if (!text) return finish(def)
        finish(text === 'y' || text === 'yes')
      })
    })
  }

  return { write, ask, close }
}
