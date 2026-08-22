# Score prototype — one artifact set, two topologies, measured

The experiment [0016-topology-format-deferred](../../../adr/0016-topology-format-deferred/index.md)
left open: *a Score `score.yaml` as a component-side sibling inside the devops
product only, to test [0005-one-image-two-topologies](../adr/0005-one-image-two-topologies/index.md)'s
"one artifact set, two topologies" claim against `score-compose` and
`score-k8s`.*

**This is not an artifact.** The directory is `_`-prefixed, and three separate
places in `framework/portal/src/lib/catalog` skip `.`/`_` directories by name:
`load.ts`'s `walk` and `readArtifacts`, and `fingerprint.ts`, whose comment
gives the reason — *"The loader never descends into dot/underscore directories,
so their contents cannot change what the catalog contains."* Measured rather
than assumed, by moving the directory out of the tree and running the checker
again: `metaframework check` reports **the same error, warning and entity counts
either way**. The digits are deliberately not quoted here — they move on every
commit and the claim does not
([0018-measured-facts-are-derived-or-dated](../../../adr/0018-measured-facts-are-derived-or-dated/index.md)).
So nothing here is an entity, no SRN addresses it, no role-table row
exists for it, no dialect is registered, and the checker neither reads it nor
reports on it. That is deliberate and 0016 said so in advance: this "cannot be
this role's format" and "would need its own decision before landing anything
addressable".

## What is here

| File                            | Describes                                                        |
| ------------------------------- | ---------------------------------------------------------------- |
| `repo-sync/score.yaml`          | the component that owns the volume and holds the App private key |
| `catalog-router/score.yaml`     | the edge — sessions, sign-in, and what fronts the portal         |
| `environment.provisioners.yaml` | the `environment` provisioner score-k8s needs and does not ship  |

**Three of the five devops components are not here, each for a stated reason.**
[telemetry](../component/telemetry/index.md) is `component-type: library` and by
rule T1 declares no environment — it has no workload to describe.
[github](../component/github/index.md) is `external` and declares no environment
either: it is reached, never run.
[signoz](../component/signoz/index.md) *is* a host entry in both topologies, and
is still excluded — it is `external`, the catalog names no image, no port and no
retention value for it, and Score's `resources` block is the shape a
platform-supplied dependency takes, not `containers`. Writing a workload file
for it would have been inventing the whole thing.

## What was run

Both reference implementations, at the versions published on their GitHub
releases, downloaded and executed on 2026-08-21:

| Tool            | Version  | Released   | Result on these files                              |
| --------------- | -------- | ---------- | -------------------------------------------------- |
| `score-compose` | 0.45.0   | 2026-07-25 | generates, stock, no custom provisioner            |
| `score-k8s`     | 0.16.0   | 2026-07-25 | **refuses**, stock; generates with the file below  |
| `score-helm`    | —        | —          | deprecated by its own README; not run              |

```bash
score-compose init && rm -f score.yaml
score-compose generate repo-sync/score.yaml      --image=metaframework/repo-sync:dev
score-compose generate catalog-router/score.yaml --image=metaframework/catalog-router:dev

score-k8s init && rm -f score.yaml
cp environment.provisioners.yaml .score-k8s/00-metaframework.provisioners.yaml
score-k8s generate repo-sync/score.yaml      --image=metaframework/repo-sync:dev
score-k8s generate catalog-router/score.yaml --image=metaframework/catalog-router:dev
```

## What Score expressed, and expressed well

**Every configuration key, exactly.** All 14 — repo-sync's 7 plus
catalog-router's 3, each with the 2 the `telemetry-config` meta-schema adds
through `allOf` — appear in the two files, none invented and none missing. Both
generators resolved every one.

**The secret/non-secret split survives into Kubernetes.** score-k8s turns a
provisioner output carrying its magic secret encoding into a real
`valueFrom.secretKeyRef`, so `production/config.yaml`'s
`source: k8s:secret/metaframework#github-app-private-key` arrives as

```yaml
- name: GITHUB_APP_PRIVATE_KEY
  valueFrom:
    secretKeyRef:
      key: github-app-private-key
      name: metaframework
```

with the value never passing through the generated file. On the compose side the
same key becomes `${GITHUB_APP_PRIVATE_KEY}`, deferred to the `.env` the
developer fills in — which is `compose/config.yaml`'s
`source: env-file:docker/.env#GITHUB_APP_PRIVATE_KEY`, unchanged.

**The join back to the catalog survives generation.** A `metadata.annotations`
entry carrying the component's SRN is copied onto the compose service *and* onto
the Kubernetes pod template, so a running container in either topology names the
entity that describes it. This costs no tooling change and adds no address: the
SRN points **out** of the file at an entity, and nothing points **at** the file.

## What Score could not express

Each row is a thing the catalog states and the workload file cannot hold. None
is a matter of taste.

| The catalog states                                                        | Score's shape                                       | Result                        |
| ------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------- |
| an HTTP surface at `/lease`, `tls: false`, **no port**                    | `service.ports.<n>.port`, required integer          | no `service` block at all     |
| `GET /health`, "liveness for the orchestrator"                            | `httpProbe` requires **both** `path` and `port`     | no probe                      |
| memory limits are "a DECISION NOT YET MADE"                               | `resources.limits.memory`, a string or absent       | no limits block               |
| `replicas: { min: 1, max: 1 }` and why 2 would corrupt worktrees          | nothing, at any level                               | stays in `topology.yaml`      |
| `HUB_LOCAL_REPO` exists in compose only; the two TTLs in production only  | one workload file, one key set                      | all keys in both topologies   |
| the region `hel1`, and `zones: []` meaning "no distribution to describe"  | nothing                                             | stays in `topology.yaml`      |

The port rows are the sharpest, and they are not a gap in this catalog. A port
number is a decision `transport.yaml` has deliberately not made, and
`topology.yaml` can carry a stated non-decision in prose where Score's schema
requires an integer or nothing. The consequence is concrete: **the
worktree-lease edge is absent from both generated topologies.** Score has the
right shape for it — `type: service-port`, params `workload` and `port`, outputs
`hostname` and `port` — and it needs a named port on repo-sync's `service` block
to point at, which cannot exist.

**Prose is not carried at all.** 82.5% of the bytes of YAML in this directory
(9,615 of 11,650) are comments and blank lines, and **zero** comment lines
appear in either generated output — 40 lines of `compose.yaml`, 99 lines of
`manifests.yaml`, no `#` in either. That is the same measurement 0016 took
against `topology.yaml` (67.3% prose) reaching the same verdict from the other
side: the argument is the content, and a generator drops it.

## The finding that matters: the two topologies disagree about durability

One `score.yaml`, one `type: volume` resource, four lines. score-compose emits

```yaml
volumes:
  repo-sync-data-xRwizR:
    name: repo-sync-data-xRwizR
    driver: local
```

— a named volume that outlives `docker compose down`. score-k8s, with its
**default** provisioner, emits

```yaml
volumes:
  - emptyDir: {}
    name: vol-bff76dbca0
```

— which does not outlive a pod restart, and so silently fails
[git-state-survives-a-restart](../requirement/git-state-survives-a-restart/index.md)
AC-2: *"Restarting or replacing the container leaves the volume intact."*
score-k8s's own default provisioner file says so out loud, in a comment above
the row:

> As an example we have a 'volume' type which returns an emptyDir volume. In
> production or for real applications you may want to replace this with a
> provisioner for a tmpfs, host path, or persistent volume and claims.

This is exactly the drift ADR 0005 accepts as its cost — *"two descriptions of
one graph, kept in step by hand"* — except worse in one respect: here there is
**one** description, and the drift is inside the toolchain, below the artifact,
where reading the artifact cannot reveal it.

Setting `k8s.score.dev/kind: StatefulSet` in `metadata.annotations` is the
documented escape hatch and, tested, it is not enough: the annotation permits a
volume provisioner to emit a claim template, but the default one still emits
`emptyDir`. A provisioner emitting `claimSpec` would work, and needs a storage
size — which `production/topology.yaml` states is unset and undecided, and which
`HUB_DATA_MAX_BYTES` is not (that is the application's eviction cap, not a
filesystem size). So the durable k8s path costs a second custom provisioner
*and* a decision nobody has made. The annotation is left out of `score.yaml` on
purpose: it is implementation-specific, and a workload file that names its
target has stopped being one artifact for two topologies.

## The chart half of ADR 0005 is not covered, and cannot be

`score-helm`'s README, verbatim:

> :warning: Deprecation Notice :warning:
>
> We have deprecated the `score-helm` CLI implementation. To get started with
> Score, we recommend using one of our reference implementations `score-compose`
> or `score-k8s`. If you're interested in developing a `score-helm` reference
> implementation, we'd love to support you! Please reach out to us for
> assistance and collaboration.

ADR 0005's pair is *compose file* and *Helm chart*. This prototype exercises
*compose file* and *raw Kubernetes manifests*. `score-k8s` produces a
`manifests.yaml` for `kubectl apply`, which is not a chart and does not become
one: no values, no templating, no release. So the half of 0005 where "rollout,
resource limits and restart policy get stated" is the half Score does not reach,
and that half was 0005's whole argument for keeping the chart.

Rendering the manifests into a chart is possible — a `templates/` directory with
literal YAML in it — and it produces the thing 0005 already rejected under
*"Kompose, or generating the chart from the compose file"*: a chart nobody wants
to read or hand-edit, which loses the reason the chart exists.

## Against 0016's six criteria, unchanged

Nothing found here moves Score toward the `topology` role, and the prototype
sharpens the original rejection rather than softening it. It fails **(a)**
structurally — these files are the workload's own description, and the
environment is not their subject; that is what makes them a legitimate
*sibling* and an illegitimate *replacement*. It fails **(c)** completely, not
narrowly: Score has no replica field at all, so there is nothing for a range to
be lossy against. It fails **(e)** at 82.5% of the YAML bytes here. It
passes **(f)** comfortably, on two implementations released the same day.

## What recognising `score.yaml` would take, and why not to

Recorded so the next reader does not have to work it out, and **not done**:

1. A row in `ARTIFACT_ROLES` (`framework/portal/src/lib/srn/artifacts.ts`) —
   `{ kind: 'component', role: 'score', file: 'score.yaml', depth: 1 }`. The
   `component` kind owns no roles today, so this would be the first.
2. A ruling in `DIALECTS` (`framework/portal/src/lib/catalog/dialects.ts`),
   which is *total* over the role table and throws at module load if a role
   arrives without one. Score files carry `apiVersion: score.dev/v1b1` rather
   than the framework's `$schema` key, so this would be the first role whose
   discriminator is somebody else's — a genuine question 0015 has not answered.
3. Both are `framework/spec` changes before they are code changes, and the spec
   is out of scope for this prototype by instruction.

The reason not to is the one 0016 already gives for the Structurizr export: a
derived or sibling artifact that nothing addresses costs no row, no migration
and no compatibility promise, and can be deleted the day it stops being
interesting. The moment `score.yaml` is addressable it is a published surface
under [0010-additive-only-evolution](../../../adr/0010-additive-only-evolution/index.md),
and this prototype has not earned that — it has two workload files for two
unbuilt components, and the thing they most need to describe (a port) is
undecided.
