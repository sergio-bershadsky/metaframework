/**
 * Monaco's JSON language worker. See `editor.worker.ts` for why the import has
 * to live in a module of our own rather than in a `new URL` call.
 *
 * JSON is the one language here with a real language service rather than a
 * tokenizer: it is what folds `schema.json`, and what reports a syntax error on
 * the exact character that broke the file.
 */
import 'monaco-editor/languages/features/json/json.worker.js'
