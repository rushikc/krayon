#!/bin/sh
# Prints the commands. Does not run them.
# Build each image with its own cloudbuild.yaml. Do not use --source . (there is no root Dockerfile).
# Deploy once so Cloud Run assigns URLs, read them, then redeploy every service with those URLs.
# Origins: --origins wins over --site. Never write URLs to a file.
set -eu

PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
REPO="${REPO:-krayon}"
BUCKET="${BUCKET:-krayon-ai.firebasestorage.app}"
TASKS_INVOKER_EMAIL="${TASKS_INVOKER_EMAIL:-krayon-tasks@${PROJECT}.iam.gserviceaccount.com}"

ORIGINS_ARG=""
SITE_ARG=""
WORKER_URL_ARG=""
RENDERER_URL_ARG=""

usage() {
  cat <<'EOF'
Usage: sh backend/scripts/30-deploy-run.sh --origins <csv> | --site <site-id> [options]

Print Cloud Run build and deploy commands. Does not run them.

  --origins <csv>     Comma-separated CORS origins (required unless derived from --site).
                      Wins over --site when both are set; values are not merged.
  --site <site-id>    If --origins is omitted, derive
                      https://<site-id>.web.app,https://<site-id>.firebaseapp.com
  --worker-url <url>  Embed WORKER_URL in --set-env-vars (else $WORKER_URL, else ${WORKER_URL})
  --renderer-url <url>
                      Embed RENDERER_URL in --set-env-vars (else $RENDERER_URL, else ${RENDERER_URL})
  -h, --help          Show this help

Env alternatives: CORS_ORIGINS, HOSTING_SITE, WORKER_URL, RENDERER_URL, PROJECT, REGION, REPO, BUCKET.

Each origin must be https://<host>, http://localhost, or http://localhost:<port>.
No path, query, fragment, trailing slash, spaces, or *.

Example:
  sh backend/scripts/30-deploy-run.sh --site <site-id>
  sh backend/scripts/30-deploy-run.sh --origins https://<site-id>.web.app,https://<site-id>.firebaseapp.com
EOF
}

validate_origin() {
  o=$1
  case "$o" in
    *'*'*|*' '*)
      echo "invalid origin: $o" >&2
      return 1
      ;;
    http://localhost)
      return 0
      ;;
    http://localhost:*)
      port=${o#http://localhost:}
      case "$port" in
        ''|*[!0-9]*)
          echo "invalid origin: $o" >&2
          return 1
          ;;
      esac
      return 0
      ;;
    https://*)
      rest=${o#https://}
      case "$rest" in
        ''|*/*|*'?'*|*'#'*)
          echo "invalid origin: $o" >&2
          return 1
          ;;
      esac
      return 0
      ;;
    *)
      echo "invalid origin: $o" >&2
      return 1
      ;;
  esac
}

validate_origins() {
  csv=$1
  oldifs=$IFS
  set -f
  IFS=,
  # shellcheck disable=SC2086
  set -- $csv
  IFS=$oldifs
  set +f
  if [ "$#" -eq 0 ]; then
    echo "CORS_ORIGINS is empty" >&2
    return 1
  fi
  for o in "$@"; do
    if [ -z "$o" ]; then
      echo "invalid origin: empty entry in comma-separated list" >&2
      return 1
    fi
    validate_origin "$o" || return 1
  done
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --origins)
      if [ "$#" -lt 2 ]; then
        echo "--origins requires a value" >&2
        usage >&2
        exit 1
      fi
      ORIGINS_ARG=$2
      shift 2
      ;;
    --site)
      if [ "$#" -lt 2 ]; then
        echo "--site requires a value" >&2
        usage >&2
        exit 1
      fi
      SITE_ARG=$2
      shift 2
      ;;
    --worker-url)
      if [ "$#" -lt 2 ]; then
        echo "--worker-url requires a value" >&2
        usage >&2
        exit 1
      fi
      WORKER_URL_ARG=$2
      shift 2
      ;;
    --renderer-url)
      if [ "$#" -lt 2 ]; then
        echo "--renderer-url requires a value" >&2
        usage >&2
        exit 1
      fi
      RENDERER_URL_ARG=$2
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SITE="${SITE_ARG:-${HOSTING_SITE:-}}"

# --origins wins over --site (and over HOSTING_SITE). CORS_ORIGINS env is the flag's fallback.
if [ -n "$ORIGINS_ARG" ]; then
  CORS_ORIGINS=$ORIGINS_ARG
elif [ -n "${CORS_ORIGINS:-}" ]; then
  :
elif [ -n "$SITE" ]; then
  CORS_ORIGINS="https://${SITE}.web.app,https://${SITE}.firebaseapp.com"
else
  echo "missing --origins or --site (or CORS_ORIGINS / HOSTING_SITE)" >&2
  usage >&2
  exit 1
fi

validate_origins "$CORS_ORIGINS" || exit 1

if [ -n "$WORKER_URL_ARG" ]; then
  WORKER_URL_VALUE=$WORKER_URL_ARG
elif [ -n "${WORKER_URL:-}" ]; then
  WORKER_URL_VALUE=$WORKER_URL
else
  WORKER_URL_VALUE='${WORKER_URL}'
fi

if [ -n "$RENDERER_URL_ARG" ]; then
  RENDERER_URL_VALUE=$RENDERER_URL_ARG
elif [ -n "${RENDERER_URL:-}" ]; then
  RENDERER_URL_VALUE=$RENDERER_URL
else
  RENDERER_URL_VALUE='${RENDERER_URL}'
fi

ENV_COMMON="^##^WORKER_URL=${WORKER_URL_VALUE}##RENDERER_URL=${RENDERER_URL_VALUE}##TASKS_INVOKER_EMAIL=${TASKS_INVOKER_EMAIL}##BUCKET=${BUCKET}##CORS_ORIGINS=${CORS_ORIGINS}##REGION=${REGION}##PROJECT_ID=${PROJECT}##TASKS_LOCATION=${REGION}##AI_USER_QUEUE=ai-user##AI_AUTO_QUEUE=ai-auto##AI_BACKGROUND_QUEUE=ai-background##TTS_QUEUE=tts##TASK_MAX_ATTEMPTS=3##CAP_UPLOADS_PER_VISITOR_DAY=2##CAP_COURSES_GLOBAL_DAY=10##CAP_LESSON_RENDERS_GLOBAL_DAY=40##CAP_REGENERATES_GLOBAL_DAY=40##CAP_ASK_GLOBAL_DAY=300##APP_CHECK_ENFORCE=false##STALE_MINUTES=15"

echo "gcloud artifacts repositories create ${REPO} --project ${PROJECT} --repository-format docker --location ${REGION}"
echo "gcloud builds submit --project ${PROJECT} --config backend/cloudbuild.api.yaml --substitutions _REGION=${REGION},_REPO=${REPO}"
echo "gcloud builds submit --project ${PROJECT} --config backend/cloudbuild.worker.yaml --substitutions _REGION=${REGION},_REPO=${REPO}"
echo "gcloud builds submit --project ${PROJECT} --config backend/cloudbuild.renderer.yaml --substitutions _REGION=${REGION},_REPO=${REPO}"
echo "gcloud run deploy krayon-api --project ${PROJECT} --region ${REGION} --image ${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/krayon-api --allow-unauthenticated --service-account krayon-api@${PROJECT}.iam.gserviceaccount.com --set-env-vars ${ENV_COMMON}"
echo "gcloud run deploy krayon-worker --project ${PROJECT} --region ${REGION} --timeout 1800 --image ${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/krayon-worker --no-allow-unauthenticated --service-account krayon-worker@${PROJECT}.iam.gserviceaccount.com --set-env-vars ${ENV_COMMON}"
echo "gcloud run deploy krayon-renderer --project ${PROJECT} --region ${REGION} --cpu 2 --memory 4Gi --concurrency \${RENDER_CONCURRENCY:-2} --min-instances 0 --image ${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/krayon-renderer --no-allow-unauthenticated --service-account krayon-renderer@${PROJECT}.iam.gserviceaccount.com --set-env-vars ${ENV_COMMON}"
echo "# Read the URLs, then re-run this script with --worker-url and --renderer-url (or export them):"
echo "gcloud run services describe krayon-api --project ${PROJECT} --region ${REGION} --format 'value(status.url)'"
echo "gcloud run services describe krayon-worker --project ${PROJECT} --region ${REGION} --format 'value(status.url)'"
echo "gcloud run services describe krayon-renderer --project ${PROJECT} --region ${REGION} --format 'value(status.url)'"
echo "# sh backend/scripts/30-deploy-run.sh --site <site-id> --worker-url <worker-url> --renderer-url <renderer-url>"
echo "# Set VITE_API_BASE_URL to <api-url> in frontend/.env.production. Do not add a Hosting /api rewrite."
