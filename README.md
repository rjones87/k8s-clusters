# k8s-clusters

This repository defines two local `kind` clusters and deploys a demo workload to
each cluster through Argo CD.

## Repository layout

- `kind-dev.yaml`: `kind` config for the `dev` cluster
- `kind-prod.yaml`: `kind` config for the `prod` cluster
- `workloads/dev/app/*`: app-tier workloads synced into `dev-app`
- `workloads/dev/db/*`: db-tier workloads synced into `dev-db`
- `workloads/dev/obs/*`: observability workloads synced into `dev-obs`
- `workloads/prod/app/*`: app-tier workloads synced into `prod-app`
- `workloads/prod/db/*`: db-tier workloads synced into `prod-db`
- `workloads/prod/obs/*`: observability workloads synced into `prod-obs`
- `argocd/*.yaml`: Argo CD `Application` templates
- `src/*`: source for custom container images that are deployed into the clusters
- `src/SERVICES.md`: rules for adding a new custom service
- `bootstrap-argocd-repo-creds.sh`: creates Argo CD repo credentials in both clusters from a local SSH key
- `install-argocd.sh`: installs Argo CD into both clusters
- `deploy-hello-apps.sh`: renders and applies the `Application` resources
- `build-custom-images.sh`: builds local custom images and loads them into both `kind` clusters
- `manage-kind-cluster.sh`: delete, create, or recreate a single `kind` cluster
- `port-forward-postgres.sh`: temporary local access to in-cluster PostgreSQL services for tools such as DBeaver
- `install-chaos-mesh.sh`: installs Chaos Mesh into a target cluster, defaulting to `kind-dev`
- `chaos/dev/*`: starter Chaos Mesh experiments for the stateless `dev` tier

## Prerequisites

- `kind`
- `kubectl`
- Docker or another supported `kind` container runtime
- a GitHub deploy key private key available locally for this repo, defaulting to
  `~/.ssh/argocd-k8s-clusters`

## 1. Create the clusters

```sh
kind create cluster --name dev --config kind-dev.yaml
kind create cluster --name prod --config kind-prod.yaml
```

If you want to work on only one cluster at a time, use the single-cluster helper:

```sh
./manage-kind-cluster.sh delete prod
./manage-kind-cluster.sh create prod
./manage-kind-cluster.sh recreate dev
```

The helper only manages the selected cluster. The existing scripts
`install-argocd.sh`, `bootstrap-argocd-repo-creds.sh`, `build-custom-images.sh`,
and `deploy-hello-apps.sh` still assume both `kind-dev` and `kind-prod` exist.
If you delete `prod`, avoid running those dual-cluster scripts until `prod` is
created again.

## 2. Install Argo CD into each cluster

```sh
./install-argocd.sh
```

## 3. Bootstrap Argo CD repository credentials

This repository is private, so each Argo CD instance needs SSH credentials before
it can sync.

Generate a dedicated deploy key if you do not already have one:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/argocd-k8s-clusters -N "" -C "argocd-k8s-clusters"
```

Add the public key at `~/.ssh/argocd-k8s-clusters.pub` to the GitHub repository
as a read-only deploy key, then create the Argo CD repository secret in both
clusters:

```sh
./bootstrap-argocd-repo-creds.sh
```

Optional overrides:

```sh
ARGOCD_SSH_KEY_PATH=$HOME/.ssh/argocd-k8s-clusters \
ARGOCD_REPO_URL=git@github.com:rjones87/k8s-clusters.git \
ARGOCD_NAMESPACE=argocd \
./bootstrap-argocd-repo-creds.sh
```

## 4. Register the applications

By default, `deploy-hello-apps.sh` points Argo CD at this GitHub repository:

- `git@github.com:rjones87/k8s-clusters.git`

Apply the `Application` resources:

```sh
./deploy-hello-apps.sh
```

Optional overrides:

```sh
ARGOCD_INSTALL_URL=https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml \
./install-argocd.sh

ARGOCD_REPO_URL=git@github.com:rjones87/k8s-clusters.git \
ARGOCD_TARGET_REVISION=master \
ARGOCD_NAMESPACE=argocd \
./deploy-hello-apps.sh
```

## 5. Verify deployment

Check the `Application` objects:

```sh
kubectl get applications -n argocd --context kind-dev
kubectl get applications -n argocd --context kind-prod
```

Check the workloads:

```sh
kubectl get deploy,svc --context kind-dev
kubectl get deploy,svc --context kind-prod
kubectl get statefulset,pvc --context kind-dev
kubectl get statefulset,pvc --context kind-prod
```

Access the services locally through Kong:

- `http://127.0.0.1:30080/api/hello` for the `dev` hello service
- `http://127.0.0.1:30080/api/comments` for the `dev` comments service
- `http://127.0.0.1:30080/docs/api` for the `dev` API docs
- `http://127.0.0.1:30080/nginx` for the `dev` nginx service
- `http://127.0.0.1:30090/api/hello` for the `prod` hello service
- `http://127.0.0.1:30090/api/comments` for the `prod` comments service
- `http://127.0.0.1:30090/docs/api` for the `prod` API docs
- `http://127.0.0.1:30090/nginx` for the `prod` nginx service

Access the Argo CD UIs locally:

- `https://127.0.0.1:30180` for `dev`
- `https://127.0.0.1:30190` for `prod`

Access Grafana locally:

- `http://127.0.0.1:30280` for `dev`
- `http://127.0.0.1:30290` for `prod`
- default login: `admin` / `admin`

Temporary PostgreSQL access for local tools such as DBeaver:

```sh
./port-forward-postgres.sh dev app
./port-forward-postgres.sh dev comments
./port-forward-postgres.sh dev all
```

Press `Ctrl+C` to stop the temporary access.

## Chaos Mesh

This repo treats Chaos Mesh as an in-cluster tool for fault injection. The
recommended local workflow is to install it into `kind-dev` only and use it to
test the stateless tier:

- `kong`
- `hello`
- `comments`
- `api-docs`
- `comments-ui`
- `alloy`

Install Chaos Mesh into `dev`:

```sh
./install-chaos-mesh.sh kind-dev
```

Open the dashboard locally:

```sh
kubectl port-forward -n chaos-mesh --context kind-dev svc/chaos-dashboard 2333:2333
```

Then open:

- `http://127.0.0.1:2333`

Starter experiments:

```sh
kubectl apply --context kind-dev -f chaos/dev/pod-kill-kong.yaml
kubectl apply --context kind-dev -f chaos/dev/pod-kill-hello.yaml
kubectl apply --context kind-dev -f chaos/dev/pod-kill-comments.yaml
kubectl apply --context kind-dev -f chaos/dev/pod-kill-api-docs.yaml
kubectl apply --context kind-dev -f chaos/dev/pod-kill-comments-ui.yaml
kubectl apply --context kind-dev -f chaos/dev/pod-kill-alloy.yaml
kubectl apply --context kind-dev -f chaos/dev/network-delay-comments-ui-to-comments.yaml
```

These manifests require the Chaos Mesh CRDs to be installed first, so they will
not validate or apply successfully until after `./install-chaos-mesh.sh kind-dev`
has completed.

Delete an experiment after testing:

```sh
kubectl delete --context kind-dev -f chaos/dev/pod-kill-comments.yaml
```

## Notes

- `src/hello-api` is the reference custom service. It is a Node.js + Express app
  with `/hello`, `/health`, and `/metrics`.
- `src/comments-api` is a Node.js + Express CRUD service backed by a dedicated
  PostgreSQL instance per environment. It creates its own table if needed and
  exposes CRUD and latency metrics for comment operations.
- `src/api-docs-service` publishes a shared OpenAPI document and Swagger UI for
  the services exposed through Kong at `/docs/api`.
- Custom services should prefix all Prometheus metrics with their service name so
  they are easy to identify in Grafana and Prometheus.
- Health checks are tracked separately from normal API traffic, including a
  dedicated `*_healthcheck_up` gauge and `*_healthcheck_requests_total` counter.
- `build-custom-images.sh` must be run after cluster creation and before syncing
  custom-image workloads so `kind` can serve those images locally.
- Rebuilding a single cluster is straightforward:
  1. `./manage-kind-cluster.sh recreate <dev|prod>`
  2. `./install-argocd.sh`
  3. `./bootstrap-argocd-repo-creds.sh`
  4. `./build-custom-images.sh`
  5. `./deploy-hello-apps.sh`
- Deleting only `prod` is safe for day-to-day work on `dev`, but the current
  bootstrap/deploy scripts are not yet single-cluster aware.
- Alloy ships pod logs to Loki, so services only need to log to `stdout`.
- Alloy relabels Kubernetes metadata into Loki labels, so Grafana log queries can
  filter by labels such as `namespace`, `pod`, `container`, `node`, and `app`.
- Prometheus now discovers annotated pods, so new services should add standard
  `prometheus.io/*` annotations to their pod template.
- The Argo CD `Application` destination is `https://kubernetes.default.svc`, so
  each cluster runs its own Argo CD instance and syncs into itself.
- `bootstrap-argocd-repo-creds.sh` reads the local deploy key and applies the
  Argo CD repository secret to both clusters without storing the private key in
  Git.
- PostgreSQL is deployed internally in each cluster as a single-replica
  StatefulSet and is split into standalone Argo CD applications `dev-db` and
  `prod-db`.
- Grafana, Prometheus, Loki, and Alloy are deployed as standalone Argo CD
  applications `dev-obs` and `prod-obs`.
- Grafana is exposed on new host ports, so if your existing clusters were
  created before this change you need to recreate them for the Grafana URLs to
  work.
- Kong runs in DB-less mode using declarative configuration from
  `workloads/*/app/kong.yaml`.
- `install-argocd.sh` patches `argocd-server` to `NodePort` so the UI is
  reachable on the host ports above after cluster creation.
- If you want one central Argo CD to manage both clusters, the application
  destination and cluster registration model need to change.
