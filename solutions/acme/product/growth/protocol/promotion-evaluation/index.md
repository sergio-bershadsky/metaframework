---
name: promotion-evaluation
kind: protocol
version: 7
title: Promotion evaluation
summary: Synchronous pricing conversation — checkout asks the engine what a cart is worth and gets a short-lived quote.
status: review
owner: team-growth
style: request-response
participants:
  - alias: checkout
    ref: /product/shop/component/checkout
    role: initiator
  - alias: promotion-engine
    ref: /product/growth/component/promotion-engine
    role: responder
  - alias: audience
    ref: /product/growth/component/audience
    role: responder
  - alias: coupon-service
    ref: /product/growth/component/coupon-service
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - standard: RFC 9110 HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
relations:
  uses:
    - /environment/production
tags:
  - promotions
  - synchronous
---

[checkout](srn://acme/product/shop/component/checkout) is the only initiator.
[audience](srn://acme/product/growth/component/audience) and
[coupon-service](srn://acme/product/growth/component/coupon-service) are reached
behind [promotion-engine](srn://acme/product/growth/component/promotion-engine)
and never expose an edge outside growth. It is `request-response` and not a bus
because the caller names the callee and blocks on the reply — checkout cannot
render a basket without knowing what it costs.

## Placement

The component participants span two products: checkout under
[shop](srn://acme/product/shop), the other three under
[growth](srn://acme/product/growth). Taken pair by pair their common prefix is
empty, so the nearest-common-ancestor rule places this protocol at the solution
root, next to [settlement](srn://acme/protocol/settlement).

It sits in growth's bucket today because growth authored and still unilaterally
owns the contract while the product is `incubating`; shop is a client that can
be switched off. `W_STRUCT_PROTOCOL_NCA` is therefore raised against this page,
and it is right — the finding and this section reach the same conclusion. The
section exists so that a reader arriving from `/diagnostics` finds the reason
rather than a gap, and the warning stays until the reason stops holding.

Relocating is the first item on the graduation checklist in
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing),
and it becomes due the moment checkout authors its `uses` edge — at that point
the two products co-own the surface and the rule stops being a formality.

**Checkout has now authored that edge.** The checklist item is therefore open
work rather than a future condition, and none of it is done here: the swap
described below is a procedure with several steps and a successor entity, and
`W_STRUCT_PROTOCOL_NCA` stays raised against this page until somebody performs
it. The section above still explains why the protocol sits where it does; what
changed is that the explanation is now a debt rather than a reason.

Relocating means a **swap, not a move**. An earlier version of this section said
the directory "moves" to `srn://acme/protocol/promotion-evaluation`, and no
entity in this framework may be moved or renamed: the SRN *is* the path, so a
move is a delete plus an unrelated create, and the version-to-commit index does
not follow it. The legal execution is the swap procedure — author a successor
protocol at the solution root at `version: 1`, `status: draft`, carrying a
`supersedes` edge back to this entity; migrate the participants' component edges
one at a time; set this entity to `status: deprecated` once the reverse-reference
query shows nothing live pointing here; and leave it on disk permanently. Every
version of this protocol stays reachable that way, which is the whole reason the
rule exists — and a swap is why the checklist item is a piece of work rather than
a `git mv`.

## The conversation is advisory

Every reply is a
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1),
including the degraded one. There is no error response for "the engine is
unwell": a quote with `fallback: true` and an empty `applied` list is a complete,
valid answer meaning "price this cart undiscounted", and checkout proceeds. The
reasoning is in
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing).

Problem documents do still appear, but only where a request was genuinely
malformed or a coupon genuinely refused — never to signal degradation. Those use
[problem](srn://acme/datamodel/problem@1), like every other failure that crosses
a boundary in this solution.

## Withdrawing a code is a re-evaluation, not an undo

`remove-coupon` is the fourth operation, and the surprising part is that it
cannot be implemented by subtracting what the code contributed. A coupon that
wins competes with the automatic promotions it beat: `SUMMER20` may have
suppressed a stackable 10% that becomes eligible again the moment it goes. Undoing
the coupon's own line would leave the customer worse off than if they had never
typed it, which is the one outcome guaranteed to produce a support ticket.

So the transition is `quoted` → `evaluating` and the whole cart is priced again,
exactly as `COUPON_PRESENTED` does in the other direction. The state machine gains
one edge and no new state, which is the shape of the argument: removal is not a
new kind of thing that happens to a quote, it is the same thing with a different
trigger.

It is idempotent by construction. Removing a code that was never applied returns
the quote unchanged rather than refusing, because the caller that retries after a
timeout cannot tell which of the two happened, and a `404` would make the basket
show an error for an action that succeeded.

## Quotes expire deliberately fast

A quote binds nothing. Checkout re-quotes when the cart changes and again
immediately before it converts the cart to an order, and the second quote is the
one that becomes a
[redemption](srn://acme/product/growth/datamodel/redemption@1). The alternative —
holding a discount for a customer while they decide — would require a
distributed lock across a component that is explicitly allowed to be
unavailable.

The consequence is visible to the customer: a discount shown in the basket can
disappear at the payment step because a budget ran out in between. That was
accepted as the honest failure mode, and the `rejected` list exists so the
basket can say which one and why.

`workflows/re-quote.yaml` is that moment written down. It was described in this
paragraph for two versions and modelled nowhere, which is exactly the kind of gap
a prose-only protocol accumulates: the sentence "checkout re-quotes before it
converts" reads like a detail, and the exchange it stands for contains the only
rule in this protocol that constrains what a customer can be charged.

The rule is that the price may fall without asking and may not rise without
asking. A re-quote that comes back lower is applied silently; one that comes back
higher stops and shows the difference. Splitting it out of `price-cart` makes
that asymmetry a step in a diagram rather than a paragraph somebody has to
remember, and it puts the coupon burn where it belongs — after the confirmation,
so an abandoned basket never spends a single-use code.

It also gives the expiry case somewhere to live. A quote that lapsed between
basket and payment is a problem document and a fresh `price-cart`, not a
degraded answer: nothing failed, the customer simply took longer than 120
seconds, and conflating that with the fallback path would have hidden a slow
checkout behind a metric meant to track engine health.

## Four ways to end, not three

`superseded` is the state this machine was missing, and the re-quote workflow is
what made its absence obvious. Before it, a quote replaced by a newer one for the
same cart had nowhere to go but `expired`, and that reading is wrong in the only
place it is read: the basket. "Your offer expired" is what a customer sees when
they dawdled; a customer who added an item and got a fresh quote did nothing of
the sort, and telling them otherwise invents a failure out of normal shopping.

The distinction also matters to anyone measuring this protocol. Expiry rate is a
signal about how long checkout takes; supersession rate is a signal about how
much customers edit their baskets. Folded together they are one number that moves
for two unrelated reasons and can therefore be used to argue for nothing.

Both `quoted` and `degraded` gain the transition, and the degraded case is the
more interesting one: it is the ordinary way a fallback quote ends, when the
engine recovers and the re-quote answers properly. A degraded quote that reaches
`superseded` is the system working, which is not a sentence that could be written
while the only exit was named after failure.

Adding a state and two edges is additive under the evolution rules — no existing
transition changed, and a consumer written against version 3 sees an unfamiliar
terminal state where it previously saw `expired`. That consumer must treat an
unknown terminal state as terminal, which is the reading the `tags` array exists
to make possible without enumerating names.

## Artifacts

`transport.yaml` binds the conversation to HTTP inside the cluster and
enumerates the four operations; there is no OpenAPI document, so that list is
authoritative rather than a copy of one. `workflows/price-cart.yaml` is the main
exchange — it is where the `loop` over candidate promotions and the
eligible/ineligible `alt` live. `workflows/re-quote.yaml` is the short second
exchange at conversion time, and the two together are the whole conversation:
everything else a caller does is one of these two with a different trigger.
`states.json` describes one quote's lifecycle as the engine sees it, not the
internal state of any participant.

The message-to-datamodel matrix on this page is derived from those files; the
payload models are deliberately absent from `relations`, which carries only the
non-payload dependency on [production](srn://acme/environment/production).
