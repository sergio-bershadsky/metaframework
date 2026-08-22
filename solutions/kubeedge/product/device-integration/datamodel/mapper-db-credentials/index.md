---
name: mapper-db-credentials
kind: datamodel
version: 1
title: Mapper database credentials
summary: The three environment variables a generated mapper reads — and the whole of what this framework's config contract can describe about KubeEdge.
status: review
owner: sergio-bershadsky
usage: config
abstract: true
tags:
  - config
  - mapper
  - finding
---

Three keys, all of them secrets, read straight from the process environment by
the database clients the mapper scaffold generates. A mapper configured to push
readings into Redis, MySQL or TDengine reads a password; one pushing into
InfluxDB 2 reads a token; the TDengine client also reads a user name. Everything
else about those connections — the address, the database, the bucket, the
organisation — arrives in the device resource, inside a
[push method](srn://kubeedge/datamodel/push-method@1), which is why none of it is
here.

The model is `abstract: true` deliberately. There is no single component that
reads these: the scaffold generates a *new program per protocol*, and every one
of them reads the same three names. A concrete contract belongs in the bucket of
a container that runs, and the container that runs is generated downstream of
this repository. This is the shared surface, which is exactly what an abstract
config model is for.

## This is the entire environment-variable surface of KubeEdge

That claim is measured rather than asserted. Across the v1.23.1 source tree,
excluding `vendor/` and every `_test.go` file, there are **9** call sites that
read a process environment variable. Eight of them name a literal key and those
name **6** distinct keys; the ninth is a conformance-test helper taking the key
as an argument. Three of the six are the ones below. The others are a
test-configuration path, a socket-module configuration path used by the
message-bus library, and one flag that turns off an environment pre-check in the
edge runtime.

Nothing else in a KubeEdge deployment is configured this way. The cloud runtime
and the edge runtime read a **versioned Kubernetes component-config document** —
an API-versioned YAML object nested three and four levels deep, whose defaults
are compiled into the shipped types and whose keys are paths such as the edge
hub's websocket server address or the event bus's broker mode.

## What that costs this framework, precisely

The `usage: config` contract is defined as a flat map of `SCREAMING_SNAKE` keys to
scalars, on the stated premise that an instance of it is what a process
environment is. For KubeEdge the premise does not hold, and the consequences are
not cosmetic:

- **The join has no operands.** The check the contract exists for — an
  environment provides every required-no-default key a hosted component needs —
  can only ever run over these three keys, on a component that is generated. The
  keys that would actually stop a deployment starting are nested paths in a
  mounted YAML, and no contract can name them.
- **Flattening is not available as a workaround.** There is no convention to
  flatten into: the runtimes read the document, not variables, so any invented
  `MODULES__EDGE_HUB__WEBSOCKET__SERVER` would describe a key no process has ever
  looked for. Writing it would put a fiction into the one place the framework
  intends to be checkable.
- **The honest catalog is nearly empty here**, and that emptiness is the
  finding. The environments in this solution declare almost nothing for the same
  reason.

The recommendation this catalog carries upward is narrow: the flat discipline is
right about what an environment variable is, and wrong that a component's
configuration surface is one. A nested contract needs a flattening convention
only for the *join*, and the join could equally be defined over JSON Pointers,
which the nested document already has and which no runtime has to implement.

## Secrets, and where they are not

All three keys are marked `writeOnly`, which in this framework means the value
never enters the catalog. Note the shape of the split upstream: the *address* of
a database is public configuration in a Kubernetes resource that any reader of
the cluster can see, while the credential for it comes from the environment. That
is a reasonable split and it is why these three keys are the only ones here — a
contract that also listed the addresses would be duplicating the device resource.

None of the three is `required`. Each is read only by the client for the database
a given mapper was built to push to, and a mapper with no database push target
reads none of them. So the must-provide set is empty, and an environment that
declares nothing is not in violation.

Sources: `data/dbmethod/{redis,mysql,tdengine,influxdb2}/client.go` in the
[mapper-framework template](https://github.com/kubeedge/mapper-framework/tree/v1.23.0),
also staged in the main repository at
[`staging/src/github.com/kubeedge/mapper-framework`](https://github.com/kubeedge/kubeedge/tree/v1.23.1/staging/src/github.com/kubeedge/mapper-framework);
[`apis/componentconfig/edgecore/v1alpha2/default.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/componentconfig/edgecore/v1alpha2/default.go)
for the shape the contract cannot hold.
