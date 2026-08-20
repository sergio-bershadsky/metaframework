---
name: self-service-registration
kind: requirement
version: 1
title: A customer can create an account without an operator
summary: A person can register, verify their handle, and sign in with no human on acme's side involved.
status: review
owner: team-identity
requirement-type: functional
priority: should
relations:
  uses:
    - /product/identity/datamodel/account@1
tags:
  - onboarding
  - conversion
---

A [customer](srn://acme/actor/customer) must be able to go from nothing to a
signed-in session without anyone at acme touching the request. The obligation is
commercial before it is technical — every account that needs an operator is an
account that does not get created at nine in the evening — but it is also the
constraint that keeps
[registration](srn://acme/product/identity/component/registration) honest: a path a human
can rescue is a path nobody bothers to make correct.

It is a `should` rather than a `must` because the product ships without it. The
fallback, an [identity-admin](srn://acme/actor/identity-admin) provisioning
accounts by hand, exists, works, and does not scale past the first fifty
customers.

## Acceptance criteria

- A person completes registration with a handle and one credential, and holds an
  authenticated [session](srn://acme/product/identity/datamodel/session@1) at the end of
  it, with no operator action at any step.
- The account is created in `pending-verification` and cannot authenticate until
  the handle is proved.
- The self-service and administrative paths produce the same
  [account](srn://acme/product/identity/datamodel/account@1) shape, differing only in
  `principal-type` and in who is recorded in `changed-by`.
- A registration that is abandoned after account creation leaves no account that
  can ever authenticate, and the handle becomes available again after 72 hours.
- Registering with a handle that already exists returns the same response as
  registering with a new one, and sends mail to the existing address instead.

## Rationale

The last criterion is the contested one and the reason this requirement is still
in `review`. Making the duplicate-handle case indistinguishable costs a real
conversion drop — the person who mistyped their address gets no error and waits
for mail that will not come — and it is the only thing standing between a public
endpoint and an account-enumeration oracle. `team-identity` holds that the
enumeration risk wins; the growth team disagrees in writing.

The third criterion is the same discipline
[guest-checkout](srn://acme/product/shop/requirement/guest-checkout) applies to orders. One
record shape, two ways in. A separate "self-registered" account would have grown
a branch in every consumer of an account, and the branches would have drifted
within a quarter.

## Out of scope

Registration of a service principal. Those are provisioned by
[release-bot](srn://acme/actor/release-bot) through the administrative path, and a
machine that could self-register would be a machine that could grant itself an
identity — the one thing this product exists to prevent.
