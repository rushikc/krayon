#!/bin/sh
# Prints the commands. Does not run them.
# Worker timeout is at least 1800s. API CORS is the Hosting origin. Vertex stays global.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
echo "gcloud run deploy krayon-api --project ${PROJECT} --region ${REGION} --source . --no-allow-unauthenticated"
echo "# API service account krayon-api, timeout 60s, set CORS_ORIGINS to the Firebase Hosting origins"
echo "gcloud run deploy krayon-worker --project ${PROJECT} --region ${REGION} --timeout 1800 --service-account krayon-worker@${PROJECT}.iam.gserviceaccount.com"
echo "gcloud run deploy krayon-renderer --project ${PROJECT} --region ${REGION} --cpu 2 --memory 4Gi --concurrency \${RENDER_CONCURRENCY:-2} --min-instances 0 --service-account krayon-renderer@${PROJECT}.iam.gserviceaccount.com"
echo "# Set VITE_API_BASE_URL to the krayon-api Cloud Run URL. Do not add a Hosting /api rewrite."
