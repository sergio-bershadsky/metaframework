{{/*
Naming.

The release-level name is `metaframework`; every object this chart renders is
suffixed `-portal`. The suffix is not decoration — environment/production/
topology.yaml names three other workloads (catalog-router, repo-sync, signoz),
and an unsuffixed `metaframework` Deployment would quietly claim to be all of
them. Leaving the room named makes their absence legible in `kubectl get all`.
*/}}

{{- define "metaframework.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "metaframework.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "metaframework.portal.fullname" -}}
{{- printf "%s-portal" (include "metaframework.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "metaframework.chartLabel" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "metaframework.portal.selectorLabels" -}}
app.kubernetes.io/name: {{ include "metaframework.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: portal
{{- end -}}

{{- define "metaframework.portal.labels" -}}
helm.sh/chart: {{ include "metaframework.chartLabel" . }}
{{ include "metaframework.portal.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: metaframework
{{- end -}}

{{- define "metaframework.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "metaframework.portal.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
The one image reference, assembled in one place so the compose file has exactly
one string to agree with. `registry` is optional and empty by default.
*/}}
{{- define "metaframework.portal.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- if .Values.image.registry -}}
{{- printf "%s/%s:%s" (trimSuffix "/" .Values.image.registry) .Values.image.repository $tag -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end -}}
{{- end -}}

{{/*
Guards.

Every one of these refuses to render a manifest that would encode a decision the
catalog explicitly records as unmade. They fail the render rather than defaulting
quietly, which is the whole complaint topology.yaml makes about chart defaults.
Included once from deployment.yaml so a single `helm template` trips them all.
*/}}
{{- define "metaframework.guards" -}}

{{- if not .Values.image.repository -}}
{{- fail "image.repository is empty. The chart deploys the image docker/ builds; set image.repository (and image.registry if you have one). See values.yaml." -}}
{{- end -}}

{{- if lt (int .Values.replicaCount) 1 -}}
{{- fail "replicaCount must be at least 1: environment/production/topology.yaml states replicas { min: 1, max: 1 } for every workload in this environment." -}}
{{- end -}}

{{- if gt (int .Values.replicaCount) 1 -}}
{{- fail (printf "replicaCount is %d but environment/production/topology.yaml states replicas { min: 1, max: 1 } for every workload in this environment, with scaling: none. Both bounds are enforced, because a guard that quotes a max and checks only the min is a guard that reads as enforcement and is not. If more than one replica is correct, that is a change to the topology claim first and to this value second." (int .Values.replicaCount)) -}}
{{- end -}}

{{- if not (has .Values.catalog.mode (list "deployment" "working-tree")) -}}
{{- fail (printf "catalog.mode must be \"deployment\" or \"working-tree\", got %q. Those are the only two values src/lib/catalog/mode.ts recognises." .Values.catalog.mode) -}}
{{- end -}}

{{- if not .Values.catalog.dir -}}
{{- fail "catalog.dir is empty. The packaged server does not discover a catalog by walking up — that lives in bin/discover.mjs, which server.js never runs — so CATALOG_DIR must be set or the process finds nothing." -}}
{{- end -}}

{{- if .Values.catalog.volume.enabled -}}
{{- if not .Values.catalog.volume.existingClaim -}}
{{- fail "catalog.volume.enabled is true but catalog.volume.existingClaim is empty. This chart deliberately creates no PVC: a claim needs a size and a storageClass, and environment/production/topology.yaml states volume sizing as a decision not yet made." -}}
{{- end -}}
{{- end -}}

{{- if .Values.ingress.enabled -}}
{{- if not .Values.ingress.host -}}
{{- fail "ingress.enabled is true but ingress.host is empty. environment/production/index.md: \"No DNS name. There is no hostname for this product anywhere in the repository.\" Supply one; the chart will not invent it." -}}
{{- end -}}
{{- end -}}

{{- end -}}
