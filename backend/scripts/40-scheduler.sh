#!/bin/sh
# Prints the commands. Does not run them.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
echo "gcloud scheduler jobs create http krayon-sweep --project ${PROJECT} --location ${REGION} --schedule '*/5 * * * *' --uri \${WORKER_URL}/tasks/sweep --http-method POST --oidc-service-account-email krayon-tasks@${PROJECT}.iam.gserviceaccount.com"
