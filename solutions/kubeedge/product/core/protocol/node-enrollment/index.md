---
name: node-enrollment
kind: protocol
version: 2
title: Node enrollment
summary: The HTTPS surface a joining node uses to obtain the cluster CA and its own client certificate, and the two task endpoints that share it.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: operator
    ref: /actor/cluster-operator
    role: initiator
  - alias: keadm
    ref: /product/core/component/keadm
    role: installer
  - alias: edgehub
    ref: /product/core/component/edgecore/component/edgehub
    role: applicant
  - alias: cloudhub
    ref: /product/core/component/cloudcore/component/cloudhub
    role: authority
tags:
  - http
  - security
  - bootstrap
---

How a machine becomes a node. Five endpoints on the same TLS listener CloudHub
runs beside its WebSocket port: two that hand out certificates, one that answers
whether a node is already known, and two that carry node-task traffic for
runtimes that cannot use the main channel.

The interesting half is the first two, because they are the trust bootstrap of
the whole system: everything the
[cloud-edge channel](srn://kubeedge/product/core/protocol/cloud-edge-channel@1)
does afterwards rests on the certificate obtained here.

## A bearer token that authenticates the server first

The token an operator prints with the installer is two things concatenated: a
hash of the cluster CA, and a signed token. The joining runtime fetches the CA
over a connection it deliberately does not verify, hashes what it received, and
compares that with the first part of its own token. Only if they match does it
send the second part as a bearer credential.

So the token authenticates the *server* to the client before it authenticates the
client to the server — which is the right way round for a bootstrap, and is
invisible in any field this framework has. `auth` carries the label
`bearer-token`; the sequence is in `workflows/enrol-a-node.yaml`, where it can
be read.

## A GET with a body

The certificate request endpoint is served as a `GET`, and the client sends a
PEM-encoded certificate signing request as the **body of that GET**. The mini-spec
models this without complaint — `method` and `path` are independent fields — but
two things do not fit:

- An operation's `request` names a datamodel, and this body is a PEM blob whose
  shape is a foreign standard's. Naming a datamodel would mean minting an entity
  to wrap bytes.
- Nothing in the artifact can say that this operation is unusual. A generated
  client that assumes GET bodies are droppable will fail here in a way no field
  warns about.

Both are left as prose, and the operation carries neither `request` nor
`response`.

## Rotation reuses the same endpoint with different credentials

The first call presents a token and no client certificate. Every later call —
rotation, on the runtime's own schedule — presents the current client certificate
and no token, against the same path. One operation, two authentication modes,
decided by which credential the caller has. The `operations` list has one entry
for it, because it is one endpoint; the two modes are in the summary.

## The refusal has no step kind, and the warning says so

`W_PROTO_WF_ORPHAN_RETURN` is raised against the `ca-rejected` step in
`workflows/enrol-a-node.yaml`, and it is right. That step is drawn edgehub →
cloudhub, every `call` in the workflow runs the same way, and so the arrow
answers nothing. The rule exists to catch exactly that: a step claiming a reply
that no request preceded.

What the warning is actually reporting is a vocabulary gap rather than a mistake
in the sequence. Nothing is sent here — the runtime compares the hash it computed
against the one in its token, they differ, and it stops. That is the whole
defence against a forged CloudHub and it runs entirely on the client. The
workflow mini-spec closes a step's `kind` at `call | return | event | error`,
and all four are arrows: every one of them draws a message from one participant
to another. None means "a participant aborts locally and the conversation never
starts". `error` is the closest available shape and it overstates the traffic by
one message.

The step is left as it stands, with its note carrying the correction, because
the alternatives are worse: drawing the arrow cloudhub → edgehub would assert a
message the server never sends, and deleting the step would remove the only
place this catalog records why an enrolling node ever refuses. A step kind for a
local abort is a change to the mini-spec, which is a decision for an ADR in the
framework's own solution and not something this survey can make.

## The other three endpoints

`GET /node/{nodename}` answers whether the cluster already knows a node of that
name, which is what makes a re-join distinguishable from a first join.
`POST /nodeupgrade` and the task-status path carry node-task traffic; they exist
on this listener because an upgrading node may not have a working main channel,
which is the same reason the certificate endpoints are here.

Sources: [`cloud/pkg/cloudhub/servers/httpserver/server.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/cloud/pkg/cloudhub/servers/httpserver/server.go),
[`common/constants/default.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/common/constants/default.go),
[`edge/pkg/edgehub/certificate/certmanager.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/edgehub/certificate/certmanager.go),
[`pkg/security/token/token.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/pkg/security/token/token.go),
[install with keadm](https://kubeedge.io/docs/setup/install-with-keadm).
