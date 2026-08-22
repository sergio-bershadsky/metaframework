---
name: cri
kind: protocol
version: 1
title: Container runtime interface
summary: The edge runtime driving containerd over Kubernetes' own container runtime interface, on a local socket.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: edged
    ref: /product/core/component/edgecore/component/edged
    role: client
  - alias: containerd
    ref: /product/core/component/containerd
    role: server
conforms-to:
  - standard: Kubernetes Container Runtime Interface
    version: runtime.v1
    url: https://kubernetes.io/docs/concepts/architecture/cri/
tags:
  - grpc
  - runtime
  - external
---

The edge runtime embeds the parts of the kubelet that manage a pod's lifecycle,
and those parts speak the same interface the kubelet speaks: gRPC to a container
runtime over a local endpoint. Nothing here is KubeEdge's own design — the value
of describing it is that it is the node's other gRPC seam, and it strains the
same fields as the device interface for different reasons.

## One package, two services, one endpoint, one string

The interface declares **two** services in one package: a runtime service of 29
calls and an image service of 5. Both are served by the same containerd process
on the same socket.

`grpc.service` is a single string. So the transport artifact below names the
runtime service, and the image service — pulling, listing, removing images, and
reporting image filesystem usage — appears nowhere in the machine-readable part
of this catalog. The alternatives were a second protocol entity whose
`transport.yaml` would be identical except for one word, with the same
participants and the same endpoint, or a `service` field holding a value the
interface does not have.

This is the same shape of finding as
[dmi-downstream](srn://kubeedge/protocol/dmi-downstream@1)'s, arrived at from the
opposite direction. There, one file declared two services with *inverted* roles,
and splitting into two entities was right. Here two services share one role, one
endpoint and one client, and splitting is wrong — but the field forces the same
decision in both cases, because it can only ever hold one name.

## No surface list, deliberately

34 calls, none of them ours, all of them specified elsewhere and stable across
Kubernetes releases. Writing them out would be transcribing a foreign interface
into a catalog that cannot check it, and the file cannot be linked either — the
interface description is vendored into the surveyed repository under a licence
this repository does not carry, and `spec.file` requires a file in the entity
directory.

So the binding block names the package, the service and the absence of transport
security, `conforms-to` names the standard with a URL, and the surface stays
where it is specified. One call is worth naming for a reason that is about this
framework rather than about CRI: the runtime service's container-event call is
**server-streaming**, and the framework's method object has a `streaming` field
that would have recorded that — the one field in the `grpc` block that fits a
real interface better than this catalog gets to demonstrate.

## The endpoint is a path, again, and its form is per-platform, again

The runtime and image endpoints both default to containerd's socket: a Unix
socket under the host's run directory on Linux, a named pipe on Windows. The
`grpc` binding block has no field for either. This is the third local-IPC
endpoint in this one catalog — two DMI sockets and this — and the second
operating-system-dependent one.

Sources: [`vendor/k8s.io/cri-api/pkg/apis/runtime/v1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/vendor/k8s.io/cri-api/pkg/apis/runtime/v1/api.proto),
[`apis/common/constants/default_others.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/common/constants/default_others.go),
[`default_windows.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/common/constants/default_windows.go).
