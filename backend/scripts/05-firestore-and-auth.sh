#!/bin/sh
# Prints the commands. Does not run them.
# Firestore Native in asia-south1.
# Anonymous auth: if the identity-platform command is unavailable, use the console:
# Firebase console → Authentication → Sign-in method → Anonymous → Enable.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
echo "gcloud firestore databases create --project ${PROJECT} --location ${REGION} --type firestore-native"
echo "gcloud identity-platform config update --project ${PROJECT} --enable-anonymous"
echo "# If that command is missing: Firebase console → Authentication → Sign-in method → Anonymous → Enable."
echo "# Create a reCAPTCHA Enterprise key for App Check in the Firebase console, then set VITE_RECAPTCHA_SITE_KEY."
