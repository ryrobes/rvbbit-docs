#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Deploy the RVBBIT docs site to Cloud Run and invalidate Cloud CDN.

Defaults match the current launch service:
  PROJECT=rabbitize
  REGION=us-east4
  SERVICE=rvbbit-docs
  IMAGE=us-east4-docker.pkg.dev/rabbitize/web/rvbbit-docs:launch
  MIN_INSTANCES=3
  MAX_INSTANCES=100
  CONCURRENCY=80
  CPU=1
  MEMORY=512Mi

Usage:
  scripts/deploy-gcp.sh [options]
  npm run deploy:gcp -- [options]

Options:
  --project VALUE          GCP project id
  --region VALUE           Cloud Run region
  --service VALUE          Cloud Run service name
  --image VALUE            Full container image reference
  --tag VALUE              Artifact Registry tag when IMAGE is not set
  --cdn-url-map VALUE      CDN URL map, comma-separated maps, "auto", or "none"
  --cdn-path VALUE         CDN invalidation path, default /*
  --cdn-host VALUE         Optional host-scoped CDN invalidation
  --skip-build             Reuse the existing image tag
  --skip-deploy            Build/invalidate only
  --skip-cdn, --no-cdn     Do not invalidate Cloud CDN
  --async-cdn              Do not wait for CDN invalidation completion
  --allow-dirty            Allow deploying uncommitted local changes
  --no-verify              Skip post-deploy curl checks
  --dry-run, -n            Print commands without running build/deploy/invalidate
  --help, -h               Show this help

Environment overrides are also supported for the uppercase names above plus:
  ARTIFACT_REPOSITORY, IMAGE_NAME, SERVICE_ACCOUNT, PORT, INGRESS,
  TIMEOUT, CPU_BOOST, STARTUP_PERIOD_SECONDS, STARTUP_TIMEOUT_SECONDS,
  STARTUP_FAILURE_THRESHOLD, CDN_ASYNC, VERIFY_URLS, ALLOW_UNAUTHENTICATED.
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [[ "${DRY_RUN}" == "1" ]]; then
    return 0
  fi
  "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

PROJECT="${PROJECT:-rabbitize}"
REGION="${REGION:-us-east4}"
SERVICE="${SERVICE:-rvbbit-docs}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-web}"
IMAGE_NAME="${IMAGE_NAME:-rvbbit-docs}"
TAG="${TAG:-launch}"
IMAGE="${IMAGE:-}"

CDN_URL_MAP="${CDN_URL_MAP:-auto}"
CDN_PATH="${CDN_PATH:-/*}"
CDN_HOST="${CDN_HOST:-}"
CDN_ASYNC="${CDN_ASYNC:-0}"

SKIP_BUILD=0
SKIP_DEPLOY=0
SKIP_CDN=0
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
DRY_RUN=0
VERIFY="${VERIFY:-1}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-1}"
VERIFY_URLS="${VERIFY_URLS:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --project=*)
      PROJECT="${1#*=}"
      shift
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --region=*)
      REGION="${1#*=}"
      shift
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --service=*)
      SERVICE="${1#*=}"
      shift
      ;;
    --image)
      IMAGE="$2"
      shift 2
      ;;
    --image=*)
      IMAGE="${1#*=}"
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --tag=*)
      TAG="${1#*=}"
      shift
      ;;
    --cdn-url-map)
      CDN_URL_MAP="$2"
      shift 2
      ;;
    --cdn-url-map=*)
      CDN_URL_MAP="${1#*=}"
      shift
      ;;
    --cdn-path)
      CDN_PATH="$2"
      shift 2
      ;;
    --cdn-path=*)
      CDN_PATH="${1#*=}"
      shift
      ;;
    --cdn-host)
      CDN_HOST="$2"
      shift 2
      ;;
    --cdn-host=*)
      CDN_HOST="${1#*=}"
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-deploy)
      SKIP_DEPLOY=1
      shift
      ;;
    --skip-cdn|--no-cdn)
      SKIP_CDN=1
      shift
      ;;
    --async-cdn)
      CDN_ASYNC=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --no-verify)
      VERIFY=0
      shift
      ;;
    --dry-run|-n)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

if [[ -z "${IMAGE}" ]]; then
  IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${TAG}"
fi

require_cmd gcloud
require_cmd git
require_cmd node
require_cmd curl

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [[ "${ALLOW_DIRTY}" != "1" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    die "Working tree has uncommitted changes. Commit them first or rerun with --allow-dirty."
  fi
fi

SERVICE_JSON=""
if SERVICE_JSON="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --format=json 2>/dev/null)"; then
  eval "$(
    SERVICE_JSON="${SERVICE_JSON}" node <<'NODE'
const service = JSON.parse(process.env.SERVICE_JSON || "{}");
const annotations = service.spec?.template?.metadata?.annotations || {};
const serviceAnnotations = service.metadata?.annotations || {};
const spec = service.spec?.template?.spec || {};
const container = spec.containers?.[0] || {};
const limits = container.resources?.limits || {};
const startup = container.startupProbe || {};
function shq(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
function out(key, value) {
  if (value !== undefined && value !== null && String(value) !== "") {
    console.log(`${key}=${shq(value)}`);
  }
}
out("CURRENT_MIN_INSTANCES", annotations["autoscaling.knative.dev/minScale"] || serviceAnnotations["run.googleapis.com/minScale"]);
out("CURRENT_MAX_INSTANCES", annotations["autoscaling.knative.dev/maxScale"] || serviceAnnotations["run.googleapis.com/maxScale"]);
out("CURRENT_CONCURRENCY", spec.containerConcurrency);
out("CURRENT_CPU", limits.cpu);
out("CURRENT_MEMORY", limits.memory);
out("CURRENT_TIMEOUT", spec.timeoutSeconds);
out("CURRENT_SERVICE_ACCOUNT", spec.serviceAccountName);
out("CURRENT_PORT", container.ports?.[0]?.containerPort);
out("CURRENT_INGRESS", serviceAnnotations["run.googleapis.com/ingress"]);
out("CURRENT_CPU_BOOST", annotations["run.googleapis.com/startup-cpu-boost"]);
out("CURRENT_STARTUP_PERIOD_SECONDS", startup.periodSeconds);
out("CURRENT_STARTUP_TIMEOUT_SECONDS", startup.timeoutSeconds);
out("CURRENT_STARTUP_FAILURE_THRESHOLD", startup.failureThreshold);
NODE
  )"
else
  log "Cloud Run service ${SERVICE} was not found; using script defaults."
fi

: "${MIN_INSTANCES:=${CURRENT_MIN_INSTANCES:-3}}"
: "${MAX_INSTANCES:=${CURRENT_MAX_INSTANCES:-100}}"
: "${CONCURRENCY:=${CURRENT_CONCURRENCY:-80}}"
: "${CPU:=${CURRENT_CPU:-1}}"
: "${MEMORY:=${CURRENT_MEMORY:-512Mi}}"
: "${TIMEOUT:=${CURRENT_TIMEOUT:-300}}"
: "${SERVICE_ACCOUNT:=${CURRENT_SERVICE_ACCOUNT:-242806648227-compute@developer.gserviceaccount.com}}"
: "${PORT:=${CURRENT_PORT:-8080}}"
: "${INGRESS:=${CURRENT_INGRESS:-all}}"
: "${CPU_BOOST:=${CURRENT_CPU_BOOST:-true}}"
: "${STARTUP_PERIOD_SECONDS:=${CURRENT_STARTUP_PERIOD_SECONDS:-240}}"
: "${STARTUP_TIMEOUT_SECONDS:=${CURRENT_STARTUP_TIMEOUT_SECONDS:-240}}"
: "${STARTUP_FAILURE_THRESHOLD:=${CURRENT_STARTUP_FAILURE_THRESHOLD:-1}}"

discover_cdn_url_maps() {
  local map default_service backend enabled
  while IFS=$'\t' read -r map default_service; do
    [[ -n "${map}" ]] || continue
    [[ "${default_service}" == *"backendServices/"* ]] || continue
    backend="${default_service##*/}"
    enabled="$(gcloud compute backend-services describe "${backend}" \
      --project="${PROJECT}" \
      --global \
      --format='value(enableCDN)' 2>/dev/null || true)"
    if [[ "${enabled}" == "True" || "${enabled}" == "true" ]]; then
      printf '%s\n' "${map}"
    fi
  done < <(gcloud compute url-maps list \
    --project="${PROJECT}" \
    --format='value(name,defaultService)' 2>/dev/null || true)
}

resolve_cdn_url_maps() {
  case "${CDN_URL_MAP}" in
    ""|none|false|0)
      return 0
      ;;
    auto)
      discover_cdn_url_maps
      ;;
    *)
      tr ',' '\n' <<<"${CDN_URL_MAP}" | sed '/^[[:space:]]*$/d'
      ;;
  esac
}

log "Deployment configuration"
cat <<EOF
Project:        ${PROJECT}
Region:         ${REGION}
Service:        ${SERVICE}
Image:          ${IMAGE}
Instances:      min=${MIN_INSTANCES} max=${MAX_INSTANCES}
Container:      cpu=${CPU} memory=${MEMORY} concurrency=${CONCURRENCY} timeout=${TIMEOUT}s port=${PORT}
CPU boost:      ${CPU_BOOST}
CDN URL map:    ${CDN_URL_MAP}
CDN path:       ${CDN_PATH}
EOF

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "Building and pushing image"
  run gcloud builds submit --project="${PROJECT}" --tag "${IMAGE}" .
fi

if [[ "${SKIP_DEPLOY}" != "1" ]]; then
  log "Deploying Cloud Run service"
  deploy_args=(
    gcloud run deploy "${SERVICE}"
    --project="${PROJECT}"
    --region="${REGION}"
    --image="${IMAGE}"
    --platform=managed
    --ingress="${INGRESS}"
    --port="${PORT}"
    --concurrency="${CONCURRENCY}"
    --cpu="${CPU}"
    --memory="${MEMORY}"
    --timeout="${TIMEOUT}"
    --service-account="${SERVICE_ACCOUNT}"
    --min-instances="${MIN_INSTANCES}"
    --max-instances="${MAX_INSTANCES}"
    --startup-probe="tcpSocket.port=${PORT},periodSeconds=${STARTUP_PERIOD_SECONDS},timeoutSeconds=${STARTUP_TIMEOUT_SECONDS},failureThreshold=${STARTUP_FAILURE_THRESHOLD}"
  )
  if [[ "${ALLOW_UNAUTHENTICATED}" == "1" || "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
    deploy_args+=(--allow-unauthenticated)
  fi
  case "${CPU_BOOST}" in
    true|True|1|yes|YES)
      deploy_args+=(--cpu-boost)
      ;;
    false|False|0|no|NO)
      deploy_args+=(--no-cpu-boost)
      ;;
    *)
      die "CPU_BOOST must be true or false, got ${CPU_BOOST}"
      ;;
  esac
  run "${deploy_args[@]}"
fi

if [[ "${SKIP_CDN}" != "1" ]]; then
  log "Invalidating Cloud CDN"
  mapfile -t cdn_maps < <(resolve_cdn_url_maps)
  if [[ "${#cdn_maps[@]}" -eq 0 ]]; then
    log "No CDN-enabled URL maps found; skipping invalidation."
  else
    for cdn_map in "${cdn_maps[@]}"; do
      invalidate_args=(
        gcloud compute url-maps invalidate-cdn-cache "${cdn_map}"
        --project="${PROJECT}"
        --global
        --path="${CDN_PATH}"
      )
      if [[ -n "${CDN_HOST}" ]]; then
        invalidate_args+=(--host="${CDN_HOST}")
      fi
      if [[ "${CDN_ASYNC}" == "1" || "${CDN_ASYNC}" == "true" ]]; then
        invalidate_args+=(--async)
      fi
      run "${invalidate_args[@]}"
    done
  fi
fi

if [[ "${VERIFY}" == "1" && "${DRY_RUN}" != "1" ]]; then
  log "Verifying live service"
  service_url="$(gcloud run services describe "${SERVICE}" \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --format='value(status.url)')"
  if [[ -z "${VERIFY_URLS}" ]]; then
    VERIFY_URLS="${service_url}/ ${service_url}/benchmarks ${service_url}/capabilities"
  fi
  for verify_url in ${VERIFY_URLS}; do
    run curl -fsS -o /dev/null "${verify_url}"
  done
  gcloud run services describe "${SERVICE}" \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --format=json | node -e '
let input = "";
process.stdin.on("data", chunk => {
  input += chunk;
});
process.stdin.on("end", () => {
  const service = JSON.parse(input);
  const annotations = service.spec?.template?.metadata?.annotations || {};
  const container = service.spec?.template?.spec?.containers?.[0] || {};
  const limits = container.resources?.limits || {};
  console.log(JSON.stringify({
    url: service.status?.url,
    revision: service.status?.latestReadyRevisionName,
    minInstances: annotations["autoscaling.knative.dev/minScale"],
    maxInstances: annotations["autoscaling.knative.dev/maxScale"],
    concurrency: service.spec?.template?.spec?.containerConcurrency,
    cpu: limits.cpu,
    memory: limits.memory,
    timeout: service.spec?.template?.spec?.timeoutSeconds,
    cpuBoost: annotations["run.googleapis.com/startup-cpu-boost"]
  }, null, 2));
});
'
fi

log "Done."
