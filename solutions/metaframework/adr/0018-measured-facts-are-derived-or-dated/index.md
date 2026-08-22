---
name: 0018-measured-facts-are-derived-or-dated
kind: adr
version: 1
title: Measured facts are derived, or they are dated
summary: A measured number in a current-state entity is derived and rendered by the portal or carries no digit at all; only the ADR bucket, whose records are dated snapshots, authors one.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-21"
relations:
  uses:
    - /product/portal/component/catalog-loader
    - /product/portal/component/console/component/entity-view
    - /product/specification/component/core-contracts
    - /product/specification/component/kind-contracts
    - /product/authoring-kit/component/reference-bundle
tags:
  - prose
  - derivation
  - drift
---

## Context

A **measured fact** is a number an author obtained by running a command against
this repository and then typed into a paragraph. The test is that the command
can be written down: `wc -l framework/portal/src/lib/history/git.ts`,
`git rev-list --count HEAD`, `npx vitest run`. It is not an SLO, not a target,
not a design constant, and not a domain figure — `99.9%` on an acme environment
and `four characters` on a coupon code are decisions, and a decision does not go
stale on somebody else's commit.

Measured facts go stale on every commit, and nothing in this repository checks
one.

### The census, counted at commit `8e7a16c`

Every number in this record is measured against the tracked tree at **`8e7a16c`**
rather than against a working directory, so each one is reproducible by anyone
with this repository for as long as the commit exists — `git ls-tree -r 8e7a16c`
and `git cat-file -p 8e7a16c:<path>`. That is the ADR discipline this record goes
on to argue for, applied to itself first.

At `8e7a16c`, `solutions/` holds **344** entities. This record is not among them:
it was written against that commit and would land in the ADR column of every
split below. Scanning every `index.md` body for a numeric claim attached to a
countable noun, with fenced code, dates and semantic versions removed first:

| Population                                               | Entities | Share of 344 |
| -------------------------------------------------------- | -------- | ------------ |
| carry a file/code measurement (lines, files, commits…)   | 95       | 27.6%        |
| carry a catalog-graph count (entities, products, edges…) | 108      | 31.4%        |
| carry at least one of the two                            | 152      | 44.2%        |

The distribution matters more than the totals, and it is lopsided in a way that
names the disease. Extracting every claim of the one shape that is mechanically
unambiguous — a backticked path followed by a line count, `` `polar.ts` (300
lines) `` — finds **52** of them, and **all 52 are in `metaframework`**. None in
acme, none in brass. Of `metaframework`'s **121** entities, **78** carry a
file/code measurement: **64%** of one solution.

That is not a catalog-wide problem. It is a **self-description** problem. acme is
a fixture and has no source tree to measure; brass describes a repository that is
not this one, so its numbers are unverifiable by any tool here and its authors
sensibly wrote almost none. Only `metaframework` documents the code it ships
beside, and only `metaframework` has therefore acquired the habit of typing that
code's dimensions into prose.

### How wrong they are

**65** claims were resolved and checked against `8e7a16c`. **46 are false — 71%.**

The number that makes that indefensible rather than merely bad is the
repository's age. `git log` runs from **2026-08-19** to **2026-08-21**: every
one of these facts was measured, by a careful author, within the last three
calendar days, and 71% of them are already wrong.

Forty-seven of those are the mechanically-extracted path-and-line-count claims
(5 of the 52 named a basename too ambiguous to resolve): **16 exact, 31 wrong**,
of which 3 are wrong by one line and 28 by more. Eighteen are aggregate claims
checked by hand: **3 right, 15 wrong**. The worst of them, with the site count in
the catalog:

| Claim                                 | Sites | Authored | At `8e7a16c` | Drift   |
| ------------------------------------- | ----- | -------- | ------------ | ------- |
| tests in the portal suite             | 3     | 395      | 924          | +529    |
| lines of TS/TSX/CSS under `src/`      | 4     | 23,277   | 37,383       | +14,106 |
| filesystem entries under `solutions/` | 4     | 597      | 980          | +383    |
| entities in the catalog               | 7     | 197      | 344          | +147    |
| commits in the repository             | 9     | 52       | 96           | +44     |
| test files in the portal suite        | 2     | 16       | 39           | +23     |
| `src/lib/history/git.ts`              | 2     | 895      | 1,178        | +283    |
| `src/lib/catalog/load.ts`             | 1     | 423      | 745          | +322    |
| `src/lib/schema/dereference.ts`       | 2     | 92       | 231          | +139    |
| `src/components/catalog-tree.tsx`     | 1     | 866      | 795          | −71     |

Three quantities are worse than stale — they carry **two contradictory authored
values at once**, in entities that do not know about each other:

| Quantity                                | One entity says | Another says | At `8e7a16c` |
| --------------------------------------- | --------------- | ------------ | ------------ |
| lines of `framework/spec/`              | 12,931          | 9,832        | 12,940       |
| lines of the distilled reference bundle | 5,070           | 3,562        | 5,072        |
| lines of `src/components/diagrams/`     | 2,816           | 3,440        | 4,562        |

A reader who opens two pages and finds them disagreeing about one `wc -l` has
learned something true about the catalog, and it is not the line count.

The count of entries under `solutions/` is the sharpest case, because a fourth
value exists outside the catalog: `fingerprint.ts`'s own docblock was re-measured
on 2026-08-20 and records **862**. Four authored numbers — 597 in four entities,
862 in the source — for a quantity that is **980** at `8e7a16c`, one day later.

The review cost is the second-order damage and it is the reason this record was
opened rather than the drift itself: this class of finding dominated the release's
review rounds. That observation leaves no artifact in this repository and is not
re-measured here, so it is offered as motivation and nothing is decided on it.
What is decided on is the 71%.

### The date convention exists, and is not enough

Twenty-eight entities already stamp a measurement — 15 `Measured 2026-08-21`, 4
`Measured 2026-08-20`, 4 `Measured 2026-08-19`, and a handful of "counted on disk
at this commit". The convention is real, applied conscientiously, and
demonstrably insufficient. [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
is the best-behaved entity in the catalog on this axis: two of its six acceptance
criteria carry a 2026-08-19 measurement date, and between them they state four
grep counts. Re-run at `8e7a16c`, **two of the four have moved** — `grep -rn
"datamodel/money"` over `solutions/acme` returns **63**, not 61, and the
unanchored deprecated-status grep returns **5** false positives inside this
solution, not 3. The other two are still exact. Two days, a 50% failure rate on
the most carefully sourced numbers in the catalog.

A date tells a reader the number is a snapshot. It does not tell them whether the
snapshot is off by two or off by 529, and a reader who cannot tell those apart has
been handed provenance instead of a fact.

### The one population that does not drift

[0013-a-second-solution-surveyed-from-real-code](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code)
states that brass "landed as commit `ec0f4be` … 148 files, 10,768 insertions, 98
entities". Checked now: `git show --stat ec0f4be` reports **148 files changed,
10768 insertions(+)**, and **98** of those paths are a `solutions/brass/**/index.md`.
Every digit is exact, and every digit will still be exact in 2030. brass holds
**111** entities now — the ADR was never wrong about that, because it never
claimed it.

The difference is grammatical, not editorial. **A measurement of a commit cannot
drift; a measurement of a working tree always does.** The ADR bucket is the
framework's only append-only chronological record — `framework/spec/kinds/adr.md`
says so in as many words, and adds that "everything else in the catalog is a
current-state description". Numbers in an ADR are dated evidence for a decision
taken on a date. Numbers in a current-state description are claims about now.

### What the portal can and cannot reach

The portal's only filesystem root is the catalog directory:
`catalogDir()` returns `process.env.CATALOG_DIR` or resolves `../../solutions`,
and every git call in `lib/history/git.ts` runs with that directory as `cwd`.
`framework/spec` and `framework/portal/src` appear in the portal's source only
inside comments. Nothing in the runtime opens a file outside the catalog.

That boundary is load-bearing and it is not an accident — `CATALOG_DIR` exists so
a catalog can live in a repository that has no portal beside it. It cuts the
problem cleanly in two:

- A **catalog fact** — how many entities, how many products, how many host
  entries, how many edges of a type — is already computed. `metaframework check`
  prints `344 entities across 3 solutions` at this commit. Nothing needs to be
  measured;
  something needs to be *rendered*.
- A **repository fact** — a line count, a commit count, a test count — is outside
  the catalog by construction, and stays outside it under every deployment the
  framework supports.

## Decision

**A measured fact in a current-state entity is derived and rendered by the portal,
or it is not written as a number at all. Only the ADR bucket authors a measured
number, and there it MUST carry the date it was measured.**

The discriminator is the one the ontology already draws, so nothing new has to be
learned to apply it:

| Where the number sits              | Reachable by the portal? | Home                                         |
| ---------------------------------- | ------------------------ | -------------------------------------------- |
| current-state entity, catalog fact | yes                      | derived and rendered; prose carries no digit |
| current-state entity, repo fact    | no                       | prose states the claim, not the digit        |
| ADR                                | irrelevant               | authored, with the measurement date          |

### Derived facts are rendered beside prose, never interpolated into it

The obvious mechanism for the first row is a placeholder an author types into a
sentence. It is rejected, and by a decision this repository already took:
[0009-srn-only-prose-linking](srn://metaframework/product/portal/adr/0009-srn-only-prose-linking)
turned down a `[[payment]]` wiki syntax "because it is a second reference syntax
in a framework whose central claim is that there is exactly one". A `{{facts.entities}}`
would be that same fork, and it would cost more here than there: AC-1 and AC-2 of
[human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
promise that a person or a model with grep alone can read this catalog, and a
paragraph whose numbers are template calls reads, to grep, as a paragraph with no
numbers in it.

So a derived fact is rendered the way every other derived thing already is. The
portal derives `used-by`, `realized-by` and `superseded-by` and puts none of them
inside a sentence; it renders them as their own surface next to the prose. A
catalog fact is that same shape of thing — a count over the loaded graph — and
belongs in the same place. The authored paragraph says the catalog is small enough
to reload on every request; the stat beside it says how small, and says it
correctly on every commit forever.

### Outside the catalog, the claim survives and the digit does not

Four rewrites, taken from entities in this solution, are the whole rule:

| Authored at `8e7a16c`                                                         | Under this decision                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| "`src/lib/history/git.ts`, 895 lines, the single largest module in `src/lib`" | "`src/lib/history/git.ts`, the single largest module in `src/lib`" |
| "instrumenting 23,277 lines of someone else's product"                        | "instrumenting a product we do not own, by hand"                   |
| "**AC-2** The run reports 16 test files and 395 tests passing"                | "**AC-2** Every suite passes and the run exits zero"               |
| "the catalog knows all 197 entity names"                                      | "the catalog knows every entity name"                              |

Each loses a digit and none loses a claim. The first was never a claim about 895:
it was a claim about *largest*, and *largest* is still true while 895 is not.
Its history is the whole argument in four rows, each recoverable with
`git cat-file -p <commit>:framework/portal/src/lib/history/git.ts` piped to
`wc -l`:

| Commit    | Date       | Lines |
| --------- | ---------- | ----- |
| `4aa3f68` | 2026-08-19 | 895   |
| `5c865d3` | 2026-08-20 | 1,023 |
| `91c909d` | 2026-08-21 | 1,178 |
| `8e7a16c` | 2026-08-21 | 1,178 |

The author measured correctly and wrote the truth. It was false the next day. No
amount of care at authoring time reaches that outcome, which is why the answer
has to be structural rather than editorial.

The third rewrite is the clearest — an acceptance criterion that pins a test
count is a criterion the suite fails by growing, which is the opposite of what it
was written to guarantee, and it is currently wrong by 529.

This is deliberately not "measure it more often". An ordinal claim (*largest*,
*the only*, *more than any other*) is cheap to keep true and expensive to get
wrong; a cardinal claim is the reverse.

### What is out of scope, stated so the rule cannot be over-applied

Targets, SLOs, design constants, domain figures and quantities fixed by a
specification are **not** measured facts and this record does not touch them.
acme's `99.9%`, a coupon's `four characters`, `nine kinds`, the four ADR headings:
none of these was obtained by running a command, and none of them drifts. The test
stays the one at the top — if you cannot write the command that produces the
number, the number is not in scope.

### What enforces it, and what deliberately does not

An earlier draft of this record stopped at "authoring discipline and rendering
plan, nothing is enforced", and priced a check at "one W class, a row in a
`framework/spec` table, an entry in the debt register until an emitter lands, and
a prose scanner that must decide which digit in an English sentence was a claim".
Two of those four turned out to be free and the fourth turned out to be
tractable, so the decision carries its own enforcement after all:

- **Two warning classes.** `W_PROSE_MEASUREMENT` — a current-state entity states
  a measured quantity as a digit; and `W_ADR_MEASUREMENT` — an ADR states one
  with nothing dating it. Warnings, for the reason `W_ARTIFACT_DIALECT` is one:
  an existing catalog must be able to adopt the framework without its build
  turning red, and a stale digit is a document that is wrong, not one that is
  broken.
- **No debt-register entry**, because both land with their emitter rather than
  ahead of it — the condition the register exists to record never arises.
- **A scanner that reads grammar, not arithmetic.** This is what makes it
  tractable and it is worth being precise about, because it is *not* the
  "authored but checked" alternative rejected below. Nothing is recomputed and no
  path is resolved: the check asks whether a sentence has the **shape** of a
  measurement, which is decidable from the sentence alone and therefore works
  identically for acme's fictional paths and brass's foreign repository. The
  price of never resolving anything is that a true number and a false one are
  reported alike — correctly, since under this decision a true measurement in a
  current-state entity is a finding too.

It is deliberately narrower than the rule. A count of `lines`, `commits`,
`insertions` or `deletions` fires anywhere; every other unit fires only within a
clause of a backticked path, because a bare digit beside a countable noun —
"three components", "eleven kinds" — is overwhelmingly a design statement, and a
check that fired on those would report a hundred non-findings to catch a dozen
real ones and be turned off inside a week. The rule stands whether or not a
warning names a given sentence.

## Consequences

- **An editorial pass over 75 entities, each a version bump.** Of the 95 entities
  carrying a file/code measurement, 20 are ADRs and keep their numbers; 75 are
  current-state descriptions and do not. Forty-six of the 52 path-and-line-count
  claims are outside the ADR bucket. That work is not glamorous and it is the
  real price of this decision — but it is finite, it is a single pass, and it is
  the last time those particular numbers have to be re-typed.
- **Some sentences get weaker, and the trade is that they stay true.** "The portal
  is too large to instrument by hand" argues less forcefully than "23,277 lines".
  The forceful version has been wrong by 14,106 lines for some time, and a reader
  who catches it discounts the argument *and* every other number on the page. A
  weaker sentence that survives contact with the next commit is the better asset.
- **ADRs keep going stale, on purpose, and readers must learn to read the date.**
  This is the carve-out and it will look like an exemption. It is not:
  [0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
  already ends with the instruction — "re-measure the internal numbers whenever
  this record is quoted; they are cheap, and a stale one is indistinguishable from
  a wrong one" — and this decision is that instruction promoted from one record's
  good manners to the bucket's rule. It also does not make ADRs immune: two of the
  six path-and-line-count claims inside ADRs are already wrong, because they were
  written about a working tree rather than about a commit. The rule that keeps
  ADR 0013 exact is that its numbers name `ec0f4be`.
- **The fact set is opened, not settled.** Which counts the portal renders, and
  at which scope, is a separate question with its own trade-offs. What ships with
  this record is the smallest answer that lets the editorial pass proceed: on a
  container, the three aggregates an author actually reached for — entities
  beneath it, artifacts beneath those, and edges into the subtree from outside —
  rendered as a strip beside the prose. They were chosen by subtraction: the
  per-kind chips above them already answer "what is in here" and the relations
  section already lists the incoming edges one by one, so these are the numbers
  no surface stated. Everything else — per-bucket scopes, counts on leaf kinds,
  anything over artifacts' contents — is still the next record's problem.
- **A derived stat is a new way to be wrong, and it is a better way.** A rendered
  count can still mislead — the wrong denominator, a scope the reader did not
  expect — but it fails identically on every page and it fails visibly, whereas 597
  and 862 and 980 fail silently in three places and disagree with each other. One
  computation with one bug beats four authors with four dates.
- **The enforcement budget stopped being the argument against a gate, inside this
  release.** The earlier draft declined to spend a code here while dozens of
  documented rules still had no emitter — a correct call at `8e7a16c`, where the
  register held 41 entries. The kind disciplines landed in the same batch as this
  record and took it apart: measured in the working tree that carries both — the
  only honest anchor for a number this batch has not committed yet — 122 codes are
  documented, 105 are emitted, and 17 sit in the register. Every one of the 17 is
  a protocol, datamodel or journey rule waiting on a *reader* the portal does not
  have, not a rule anyone declined to write. Spending the next two codes on the
  population that this record measured at 71% false is now the right order, not
  the wrong one.
- **This record is bound by its own rule, and it is an ADR.** Every number above
  names commit `8e7a16c` rather than "now", which is the strongest form the
  decision permits an ADR to carry and the form that keeps
  [0013](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code)
  exact after two years. A reader in 2028 does not need to trust this record's
  arithmetic: `git ls-tree -r 8e7a16c` still answers, and if it disagrees with a
  sentence above, the sentence is wrong and the commit is right.

## Alternatives considered

- **A placeholder syntax interpolated into prose — `{{facts.entities}}` or
  `{{lines:src/lib/history/git.ts}}`.** The version of "derive and render" that
  keeps the number inside the sentence. Rejected on two grounds already settled in
  this repository. It forks the reference syntax, which
  [0009-srn-only-prose-linking](srn://metaframework/product/portal/adr/0009-srn-only-prose-linking)
  rejected for the wiki-link case with an argument that transfers whole. And it
  breaks the grep-alone promise in
  [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable):
  every consumer that is not the portal — GitHub's markdown view, an editor, an
  agent reading the raw file, the diff a reviewer actually reads — would see the
  template and not the fact, which trades a wrong number for no number in exactly
  the contexts where review happens. The chosen form gives up interpolation and
  keeps both properties.
- **Authored but checked: a new `W_` class that recomputes and warns on drift.**
  The most attractive rejected option, and it loses on three counts. *It is
  dominated where it works*: if a checker can recompute the number, the portal can
  render it, and rendering removes the drift where a warning only reports it — the
  fix a warning prompts is a human re-typing a digit that begins rotting the same
  afternoon. *It cannot reach where it is needed*: every one of the 52
  path-and-line-count claims, every commit count and every test count lives
  outside the catalog directory, and a check that resolves repository paths is
  meaningless for acme, whose paths are fictional, and for brass, whose code is
  not in this repository — a framework rule that can only fire for one solution
  out of three is a rule about one solution.

  It stays rejected, and the two classes that shipped are **not** it. The
  difference is the whole of why one is unbuildable and the other is a single
  module: recomputation has to resolve `src/lib/history/git.ts` against a tree,
  and nothing in this framework can. A grammar check resolves nothing —
  it reads the sentence, not the repository — so it fires the same way on acme's
  fictional paths and on brass's foreign ones, and it says the one thing this
  record actually decided: *that sentence should not contain that digit*, which
  is true whether the digit is currently right or currently wrong.
- **A required measurement date on every measured fact.** Rejected as the general
  rule and **adopted for the ADR bucket**, which is the honest verdict rather than
  a rejection. The evidence against generalising it is in the catalog:
  [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
  dates the two criteria it measured and two of their four grep counts still
  drifted inside 48 hours, and
  [green-test-suite](srn://metaframework/product/portal/requirement/green-test-suite)
  carries `Measured 2026-08-19` on a test count that is now wrong by 529.

  That entity also makes the strongest case *for* this alternative, and it is
  worth quoting rather than paraphrasing: "a claim like 'the tests pass' ages into
  a lie silently, and a claim like '395 tests pass in 1.2s as of 2026-08-19' ages
  into a *comparison*. That is the only difference between a measurement and a
  boast." The argument is right about recording and wrong about placement. As a
  comparison, `395 → 924` is genuinely informative — the suite has grown 2.3×.
  As **AC-2 of a requirement**, it is a condition of acceptance that nothing
  satisfies, in a slot where a reader is entitled to read a pass/fail line. So
  the dated comparison keeps its place in the entity's prose and the criterion
  goes back to asserting green. A date converts a wrong number into a dated wrong
  number; that is worth having where the document is a snapshot by construction,
  and it is not a licence to put a moving number where a contract belongs.
- **Leave it alone and accept the drift.** The status quo, and it is the
  alternative this record replaces. Rejected on the measurement: 71% of a
  65-claim sample is false, three quantities carry two contradictory authored
  values, the largest single error is 529, and a fourth value for one of them
  lives in the source comments. Drift of that magnitude is not a rounding
  tolerance a reader can be asked to allow for — it is a page that cannot be
  cited. And the cost is not confined to the wrong numbers: the right ones become
  uncitable too, because nothing on the page distinguishes them.
- **Delete every measured number from the catalog, ADRs included.** The clean
  absolutist reading, and it is wrong for a reason the catalog demonstrates rather
  than asserts. ADR 0013's `148 files, 10,768 insertions, 98 entities` is exact
  at `8e7a16c`, verifiable by one `git show` forever, and load-bearing — it is the
  evidence that a second solution was surveyed at real scale rather than sketched.
  ADR 0016 rests on `67.3%` of a byte census that decides a format survey. A rule
  that deletes those deletes the arguments with them. Measurement is not the
  defect; measurement typed into a document that claims to describe the present is.
