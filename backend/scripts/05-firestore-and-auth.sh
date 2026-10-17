#!/bin/sh
# Prints the commands. Does not run them.
# Firestore Native in $REGION. Anonymous auth is enabled in the Firebase console / Identity Toolkit.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
echo "gcloud firestore databases create --project ${PROJECT} --location ${REGION} --type firestore-native"
echo "gcloud identity-platform config update --project ${PROJECT} --enable-anonymous"
