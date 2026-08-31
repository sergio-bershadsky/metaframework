# Publishing the catalog

Two sites, two Workers, one command:

```bash
./deploy/publish.sh
```

It validates the catalog, rebuilds the portal, crawls both sites and deploys.
The published sites are **snapshots** — they do not track edits to `solutions/`.

| Site                                | Serves                                    |
|-------------------------------------|-------------------------------------------|
| `https://metaframework.dev`         | the catalog, 490 pages                    |
| `https://schemas.metaframework.dev` | 104 schema documents, at their `$id` paths |

## Why the crawl exists

The portal renders every page at request time (`dynamic = 'force-dynamic'`;
`layout.tsx` says why — a prerendered page bakes in whichever catalog the
packager happened to have). There is no `next export` to run, so the only way to
get static HTML is to ask a running portal for it.

## Why hostnames are not in wrangler.jsonc

A `custom_domain` route needs account-level `workers/domains`. Neither token has
the whole job:

| | `CF_TOKEN` (repo `.env`) | `CF_SOCKET0_TOKEN` |
|---|---|---|
| account → `workers/scripts` | 403 | **200** |
| zone `metaframework.dev` → routes, DNS | **200 (rw)** | 403 |

So `publish.sh` deploys **content** with the account token, and the hostname was
attached **once** with the zone token as a Workers route plus a proxied DNS
record. Content deploys never touch DNS.

If the routing is ever lost, this is what recreates it — a proxied record for
each half of the address family, because a record that exists only as `AAAA`
strands every IPv4 client:

```bash
ZONE=e6fcc69d74de0ce5ce5fc71bb664a723        # metaframework.dev
# A + AAAA, both proxied. 192.0.2.1 and 100:: are documented discard addresses:
# the Worker route intercepts before anything is dialled.
curl -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"A","name":"schemas","content":"192.0.2.1","proxied":true,"ttl":1}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
curl -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"pattern":"schemas.metaframework.dev/*","script":"metaframework-schemas"}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/workers/routes"
```

The apex was previously `A 95.217.227.186`, unproxied, answering 404 over plain
HTTP with no TLS. It was replaced on 2026-08-31; that is the value to restore if
the old host is ever wanted back.

## What the crawls refuse to publish

- A catalog crawl of fewer than 50 pages — a portal that died mid-crawl looks
  exactly like a small catalog otherwise.
- A schema whose `$id` does not match the path it is about to be served at. A
  document that claims a different identity is worse than an absent one, because
  tooling follows it.
