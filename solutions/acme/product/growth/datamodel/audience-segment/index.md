---
name: audience-segment
kind: datamodel
version: 1
title: Audience segment
summary: A named conjunction of behavioural clauses, plus the size of the membership set it last produced.
status: approved
owner: team-growth
usage: storage
abstract: false
tags:
  - promotions
  - privacy
---

A segment is a rule, not a list. The rule is a conjunction of at most eight
clauses over aggregated account behaviour;
[audience](srn://acme/product/growth/component/audience) evaluates it nightly and
writes the resulting membership set to its own store, and this record keeps only
the rule, the size, and the timestamp.

The membership set is deliberately absent from the model. Materialized identity
lists are the artifact that leaks, gets copied into a spreadsheet, and outlives
the consent that justified it; keeping the set out of the exchanged model means
a segment can be reviewed in this catalog without any account appearing in it.

## The closed fact set is the privacy boundary

`clause.fact` is an enumeration of five aggregates, and the closure is the point.
Growth can ask how many orders an account has placed, how long since the last
one, what they have spent in total, which storefront they use, and whether they
consented to marketing. It cannot ask anything else — not what they bought, not
where they live, not what they browsed — because there is no way to spell the
question.

An open predicate language would have been more expressive and would have moved
the privacy review from this schema, where it is one enum a reviewer can read, to
every deployment of every rule a marketer ever writes. Widening the set is an
additive schema change and a deliberate act; that is the friction the design
wants.

`marketing-consent` is in the list because a segment must be able to *exclude*
the non-consenting, which needs the fact to be testable. It is never the sole
clause of a targeting segment — consent is permission, not an audience.

## Conjunction only

There is no `or`, no nesting, and no negation beyond what the four operators
give. Eight ANDed clauses cover every segment the commercial team has actually
asked for, and the ninth request has twice turned out to be two segments.
Arbitrary boolean trees would have required a recursive schema, a query planner,
and an answer to "what does this segment cost to evaluate" that nobody wanted to
own.

`clause` stays in `#/$defs` rather than becoming its own entity because it is
structurally trivial, has no meaning outside this rule, and no second model
references it — the promotion rule applied in the direction it usually is not.

## `min-size` guards re-identification

A segment of three accounts is a way of pricing for three named people while
calling it a segment. `min-size` refuses that at materialization time, with the
job's own default rather than a schema default so the floor can be raised for a
market without a schema change. The prohibition itself is written down as
[personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing),
where it can carry acceptance criteria a reviewer can check.
