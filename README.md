# k8s-clusters

This repository defines two local `kind` clusters and deploys a demo workload to
each cluster through Argo CD.

## Repository layout

- `kind-dev.yaml`: `kind` config for the `dev` cluster
- `kind-prod.yaml`: `kind` config for the `prod` cluster
- `workloads/dev/hello.yaml`: workload synced into `kind-dev`
- `workloads/prod/hello.yaml`: workload synced into `kind-prod`
- `argocd/*.yaml`: Argo CD `Application` templates
- `install-argocd.sh`: installs Argo CD into both clusters
- `deploy-hello-apps.sh`: renders and applies the `Application` resources

## Prerequisites

- `kind`
- `kubectl`
- Docker or another supported `kind` container runtime

## 1. Create the clusters

```sh
kind create cluster --name dev --config kind-dev.yaml
kind create cluster --name prod --config kind-prod.yaml
```

## 2. Install Argo CD into each cluster

```sh
./install-argocd.sh
```

## 3. Register the applications

By default, `deploy-hello-apps.sh` points Argo CD at this GitHub repository:

- `https://github.com/rjones87/k8s-clusters.git`

Apply the `Application` resources:

```sh
./deploy-hello-apps.sh
```

Optional overrides:

```sh
ARGOCD_INSTALL_URL=https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml \
./install-argocd.sh

ARGOCD_REPO_URL=https://github.com/rjones87/k8s-clusters.git \
ARGOCD_TARGET_REVISION=main \
ARGOCD_NAMESPACE=argocd \
./deploy-hello-apps.sh
```

## 4. Verify deployment

Check the `Application` objects:

```sh
kubectl get applications -n argocd --context kind-dev
kubectl get applications -n argocd --context kind-prod
```

Check the workloads:

```sh
kubectl get deploy,svc --context kind-dev
kubectl get deploy,svc --context kind-prod
```

Access the services locally through Kong:

- `http://127.0.0.1:30080/hello` for the `dev` hello service
- `http://127.0.0.1:30080/nginx` for the `dev` nginx service
- `http://127.0.0.1:30090/hello` for the `prod` hello service
- `http://127.0.0.1:30090/nginx` for the `prod` nginx service

Access the Argo CD UIs locally:

- `https://127.0.0.1:30180` for `dev`
- `https://127.0.0.1:30190` for `prod`

## Notes

- The Argo CD `Application` destination is `https://kubernetes.default.svc`, so
  each cluster runs its own Argo CD instance and syncs into itself.
- Kong runs in DB-less mode using declarative configuration from
  `workloads/*/kong.yaml`.
- `install-argocd.sh` patches `argocd-server` to `NodePort` so the UI is
  reachable on the host ports above after cluster creation.
- If you want one central Argo CD to manage both clusters, the application
  destination and cluster registration model need to change.
