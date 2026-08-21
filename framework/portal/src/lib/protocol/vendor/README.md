# Vendored — `xstate.schema.json`

Third-party file. Do not edit it; replace it wholesale from the source below and
re-run `src/lib/protocol/xstate.test.ts`.

## Provenance

| Field       | Value                                                                  |
|-------------|------------------------------------------------------------------------|
| File        | `schemas/xstate.schema.json`                                           |
| Package     | `@statelyai/sdk@0.21.0` (npm)                                          |
| Publisher   | Stately Software, Inc.                                                 |
| Licence     | MIT — the package's `LICENSE`, reproduced in full below                |
| `$id`       | `https://stately.ai/schemas/xstate.json`                               |
| Dialect     | JSON Schema 2020-12                                                    |
| sha256      | `ce441dafcd375b94129dde8737b7d9810a043421ce5b7f95192be0f6f54405e2`     |
| Vendored on | 2026-08-21                                                             |

`https://stately.ai/schemas/xstate.json` serves the same document minified (4176
bytes, sha256 `d827385a…`, after a redirect); it parses equal to this copy but is
**not** byte-identical to it. The npm tarball is the copy taken, because it is
the one that arrives with a licence file and a version number.

## Why it is vendored rather than fetched

The test suite must run offline — the portal's own guarantee is that a catalog
renders with no external network, and a conformance test that fetches would make
CI depend on a third party's CDN. The schema is also unversioned and
undocumented upstream: pinning bytes here is what makes a change on their side
show up as a reviewable diff instead of a red build on an unrelated commit.

## What it is used for, and what it is not

It is a **downstream conformance target**: proof that the authored `states.json`
subset really is XState, checked by machine (`xstate.test.ts`). It is not, and
must not become, the authority for `states.json` — that is
`src/lib/protocol/states.ts` and the meta-schema published at
`srn://metaframework/product/specification/datamodel/state-machine-document`.
It cannot be the authority: it validates only XState's *normalized* surface, so
every catalog file fails it as authored (hence `toXStateJson` in
`../xstate.ts`), and its `additionalProperties: false` forbids the very
`$schema` key that would point an author at it.

## Licence

```
MIT License

Copyright (c) 2026 Stately Software, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
