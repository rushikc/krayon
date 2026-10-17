#!/bin/sh
# Prints the commands. Does not run them.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
echo "gcloud iam service-accounts create krayon-api --project ${PROJECT}"
echo "gcloud iam service-accounts create krayon-worker --project ${PROJECT}"
echo "gcloud iam service-accounts create krayon-renderer --project ${PROJECT}"
echo "gcloud iam service-accounts create krayon-tasks --project ${PROJECT}"
echo "gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:krayon-api@${PROJECT}.iam.gserviceaccount.com --role roles/datastore.user"
echo "gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:krayon-worker@${PROJECT}.iam.gserviceaccount.com --role roles/datastore.user"
echo "gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:krayon-worker@${PROJECT}.iam.gserviceaccount.com --role roles/cloudtasks.enqueuer"
echo "gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:krayon-worker@${PROJECT}.iam.gserviceaccount.com --role roles/aiplatform.user"
echo "gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:krayon-renderer@${PROJECT}.iam.gserviceaccount.com --role roles/storage.objectAdmin"
echo "gcloud run services add-iam-policy-binding krayon-worker --member serviceAccount:krayon-tasks@${PROJECT}.iam.gserviceaccount.com --role roles/run.invoker --region \${REGION:-asia-south1} --project ${PROJECT}"
echo "gcloud run services add-iam-policy-binding krayon-renderer --member serviceAccount:krayon-worker@${PROJECT}.iam.gserviceaccount.com --role roles/run.invoker --region \${REGION:-asia-south1} --project ${PROJECT}"
