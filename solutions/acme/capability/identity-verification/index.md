---
name: identity-verification
kind: capability
version: 1
title: Establish who a principal is
summary: Decide, to a level of confidence acme has chosen in advance, that the principal in front of a product is the one it claims to be.
status: review
owner: team-identity
tags:
  - identity
  - cross-cutting
---

# Establish who a principal is

Acme can take a claim — *I am this account* — and raise its confidence in that
claim to a level it has decided is enough for what is being asked. It can create
the claim in the first place, by binding a handle and a first credential to a
new account; it can re-establish it later, by checking a credential and issuing
a session that every other product is willing to trust; and it can withdraw it,
in seconds rather than at token expiry, when it turns out to have been wrong.

Only the last of those three is normally called "identity". All three are one
doing, because the confidence a session carries is never higher than the
confidence of the registration that created the account behind it. Splitting
registration off as its own capability would let the catalog claim a strong
verification standing on a weak enrolment, which is the failure mode this
sentence exists to make unsayable.

Nothing in this description names a credential kind, a factor count, or a
vendor. Acme currently verifies with a password against
[credential](srn://acme/product/identity/datamodel/credential@1); a document
bureau, a passkey, or a partner's assertion would each be a new realizer and not
a new capability.

## Boundaries

- **Verification, not authorization.** Whether a verified principal may then do
  a particular thing is a different question, answered by
  [acl](srn://acme/product/identity/component/acl) against
  [authorization-check](srn://acme/product/identity/protocol/authorization-check)
  and budgeted by
  [authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency).
  The two are kept apart here for the same reason
  [identity](srn://acme/product/identity) keeps them in separate components:
  they fail differently, and a page that merged them would let a policy change
  read as an identity change.
- **The session store is a consequence, not a realizer.**
  [session-store](srn://acme/product/identity/component/session-store) is what
  makes a withdrawal take effect quickly; it establishes nothing about anyone.
  The distinction matters because it is the standing temptation of this kind —
  to list everything in the neighbourhood as a realizer until "Realized by"
  becomes a directory listing of the product.
- **Levels of confidence are a business decision, and acme has only one today.**
  There is no assurance ladder in this solution; a password is what every
  product gets. Stating the capability in terms of levels anyway is the honest
  form, because the day a payout needs a stronger check the sentence will not
  have to be rewritten — only realized differently.

## Not this

- *Being a customer* does not imply having been verified.
  [guest-checkout](srn://acme/product/shop/requirement/guest-checkout) exists
  precisely because a person can buy without an account, and
  [customer](srn://acme/actor/customer) is defined to include them. A journey
  that starts with a guest basket demonstrates no part of this capability.
- *The name a courier writes down at the door* is not verification. The
  [courier](srn://acme/actor/courier) is instructed to capture whoever actually
  took the parcel rather than whoever was expected to — that is a record of an
  event, deliberately not a claim about an identity, and reading it as one is
  how a delivery receipt turns into evidence it was never able to be.
- *An opaque account identifier held by another product* is not verification
  either. [growth](srn://acme/product/growth) stores one on a
  [redemption](srn://acme/product/growth/datamodel/redemption@1) and never
  dereferences it; holding a foreign key to an account says nothing about
  whether anyone checked who owns it.

## One realizing product today, and why the address is still solution-level

Every realizer of this capability currently sits inside
[identity](srn://acme/product/identity), which makes the solution-level
placement look like ceremony. It is not. Identity is the solution's horizontal
product, and a second realizer is the expected case rather than the exotic one —
a partner assertion accepted by [growth](srn://acme/product/growth), a document
check bought for payouts, a merchant SSO in front of
[shop](srn://acme/product/shop). Had this entity been filed under the product
that happens to realize it first, that second arrival would have forced either a
duplicate description or a reference reaching into another product's bucket. The
address is chosen for the doing, which does not move, rather than for the doer,
which does.
