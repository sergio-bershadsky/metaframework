/**
 * The Monaco core worker, as a module the bundler can turn into a worker chunk.
 *
 * Monaco resolves its workers through `MonacoEnvironment.getWorker`, and a
 * bundler only recognises `new Worker(new URL('./relative', import.meta.url))`
 * — a bare package specifier inside `new URL` is left untouched and 404s at
 * runtime. This one-line re-export is the relative module that pattern needs.
 *
 * It is not optional: Monaco registers a default link provider for *every*
 * language which computes links in this worker, so without it the editor logs
 * a worker error every second — including on the SRN links we register.
 */
import 'monaco-editor/editor/editor.worker.js'
