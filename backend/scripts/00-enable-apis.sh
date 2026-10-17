#!/bin/sh
# Prints the commands. Does not run them.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
echo "gcloud services enable run.googleapis.com cloudtasks.googleapis.com firestore.googleapis.com storage.googleapis.com aiplatform.googleapis.com texttospeech.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com logging.googleapis.com identitytoolkit.googleapis.com --project ${PROJECT}"
