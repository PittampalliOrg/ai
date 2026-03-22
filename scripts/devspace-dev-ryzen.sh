#!/usr/bin/env bash

set -euo pipefail

APP_NAME="ai-chatbot"
APP_NAMESPACE="argocd"
WORKLOAD_NAMESPACE="workflow-builder"
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_CONTEXT="${KUBE_CONTEXT:-}"
EXPECTED_CONTEXT_SUBSTRING="${KUBE_CONTEXT_SUBSTRING:-ryzen}"
SKIP_RECONCILE_ANNOTATION="argocd.argoproj.io/skip-reconcile"
REFRESH_ANNOTATION="argocd.argoproj.io/refresh"
DEVSPACE_REPLACEMENT_DEPLOYMENT="${APP_NAME}-devspace"

cleanup() {
  local exit_code="$1"

  set +e

  printf '\n==> Resetting DevSpace pods\n'
  (
    cd "$PROJECT_ROOT"
    devspace reset pods --silent --force
  )

  printf '==> Waiting for %s to disappear\n' "$DEVSPACE_REPLACEMENT_DEPLOYMENT"
  kubectl wait \
    --namespace "$WORKLOAD_NAMESPACE" \
    --for=delete "deployment/${DEVSPACE_REPLACEMENT_DEPLOYMENT}" \
    --timeout=180s >/dev/null 2>&1 || true

  printf '==> Resuming ArgoCD reconciliation for %s\n' "$APP_NAME"
  kubectl annotate application "$APP_NAME" \
    --namespace "$APP_NAMESPACE" \
    "${SKIP_RECONCILE_ANNOTATION}-" >/dev/null 2>&1 || true
  kubectl annotate application "$APP_NAME" \
    --namespace "$APP_NAMESPACE" \
    "${REFRESH_ANNOTATION}=hard" \
    --overwrite >/dev/null 2>&1 || true

  printf '==> Waiting for the production deployment %s to be ready again\n' "$APP_NAME"
  kubectl rollout status \
    --namespace "$WORKLOAD_NAMESPACE" \
    "deployment/${APP_NAME}" \
    --timeout=180s >/dev/null 2>&1 || true

  exit "$exit_code"
}

main() {
  local current_context
  current_context="$(kubectl config current-context 2>/dev/null || true)"
  if [[ -z "$current_context" ]]; then
    echo "kubectl current context is not set" >&2
    exit 1
  fi
  if [[ -n "$EXPECTED_CONTEXT" ]]; then
    if [[ "$current_context" != "$EXPECTED_CONTEXT" ]]; then
      echo "expected kube context ${EXPECTED_CONTEXT}, got ${current_context}" >&2
      exit 1
    fi
  elif [[ "$current_context" != *"$EXPECTED_CONTEXT_SUBSTRING"* ]]; then
    echo "expected a ryzen kube context containing ${EXPECTED_CONTEXT_SUBSTRING}, got ${current_context}" >&2
    exit 1
  fi

  trap 'cleanup "$?"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  printf '==> Using kube context: %s\n' "$current_context"
  printf '==> Verifying ArgoCD application %s exists\n' "$APP_NAME"
  kubectl get application "$APP_NAME" --namespace "$APP_NAMESPACE" >/dev/null

  printf '==> Verifying deployment %s exists in namespace %s\n' "$APP_NAME" "$WORKLOAD_NAMESPACE"
  kubectl get deployment "$APP_NAME" --namespace "$WORKLOAD_NAMESPACE" >/dev/null

  printf '==> Pausing ArgoCD reconciliation for %s\n' "$APP_NAME"
  kubectl annotate application "$APP_NAME" \
    --namespace "$APP_NAMESPACE" \
    "${SKIP_RECONCILE_ANNOTATION}=true" \
    --overwrite >/dev/null

  printf '==> Starting DevSpace session\n'
  cd "$PROJECT_ROOT"
  devspace dev "$@"
}

main "$@"
