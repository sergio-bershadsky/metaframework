/**
 * File extension or markdown fence label → the language id Monaco knows.
 *
 * It lives in `lib` rather than beside the editor because the *server* decides
 * it: an artifact block is assembled on the server and hands the language down
 * as data. A function exported from a `'use client'` module cannot be called
 * there at all — it is a reference to code that runs elsewhere.
 */
export function monacoLanguage(hint: string | undefined): string {
  const value = (hint ?? '').trim().toLowerCase().replace(/^\./, '')
  if (value === 'yml' || value === 'yaml') return 'yaml'
  if (value === 'json' || value === 'jsonc') return 'json'
  if (value === 'md' || value === 'markdown') return 'markdown'
  return 'plaintext'
}
