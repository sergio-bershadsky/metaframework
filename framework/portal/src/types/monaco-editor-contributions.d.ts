/**
 * Monaco's editor *contributions* ship no declaration files of their own.
 *
 * Each one is a side-effect module that registers a feature — the link
 * detector, folding, find, the cursor commands — onto the API surface that
 * `editor.api.d.ts` already declares. Nothing is ever read from them, so
 * declaring them untyped is the accurate description rather than a shortcut:
 * importing one for a value would be the mistake this shape prevents.
 */
declare module 'monaco-editor/editor/browser/*'
declare module 'monaco-editor/editor/contrib/*'

/**
 * Same shape, and imported for the same reason: the singleton services those
 * contributions are constructed with. `treeViewsDndService` is the one that
 * lives under `common/services` rather than beside a contribution.
 */
declare module 'monaco-editor/editor/common/*'
