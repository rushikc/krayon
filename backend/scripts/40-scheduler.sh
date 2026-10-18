#!/bin/sh
# Prints the commands. Does not run them.
# OIDC audience is the worker URL, the same value Cloud Run checks.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
WORKER_URL_ARG=""

usage() {
  cat <<'EOF'
Usage: sh backend/scripts/40-scheduler.sh [--worker-url <url>]

Print the Cloud Scheduler sweep job command. Does not run it.

  --worker-url <url>  Worker origin used as --uri and OIDC audience.
                      Falls back to $WORKER_URL, else ${WORKER_URL}.
  -h, --help          Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
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
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -n "$WORKER_URL_ARG" ]; then
  WORKER=$WORKER_URL_ARG
elif [ -n "${WORKER_URL:-}" ]; then
  WORKER=$WORKER_URL
else
  WORKER='${WORKER_URL}'
fi

echo "gcloud scheduler jobs create http krayon-sweep --project ${PROJECT} --location ${REGION} --schedule '*/5 * * * *' --uri ${WORKER}/tasks/sweep --http-method POST --oidc-service-account-email krayon-tasks@${PROJECT}.iam.gserviceaccount.com --oidc-token-audience ${WORKER}"
