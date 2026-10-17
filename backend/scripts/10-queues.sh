#!/bin/sh
# Prints the commands. Does not run them.
# No render queue. Every queue: dispatch deadline 1800s, max attempts 3.
set -eu
PROJECT="${PROJECT:-krayon-ai}"
REGION="${REGION:-asia-south1}"
MAX_AI_USER="${MAX_AI_USER:-6}"
MAX_AI_AUTO="${MAX_AI_AUTO:-4}"
MAX_AI_BACKGROUND="${MAX_AI_BACKGROUND:-2}"
MAX_TTS="${MAX_TTS:-4}"
queue() {
  name="$1"
  max="$2"
  echo "gcloud tasks queues create ${name} --project ${PROJECT} --location ${REGION} --max-dispatches-per-second 5 --max-concurrent-dispatches ${max} --max-attempts 3 --max-retry-duration 3600s"
  echo "gcloud tasks queues update ${name} --project ${PROJECT} --location ${REGION} --max-concurrent-dispatches ${max} --max-attempts 3 --max-dispatch-deadline 1800s"
}
queue ai-user "$MAX_AI_USER"
queue ai-auto "$MAX_AI_AUTO"
queue ai-background "$MAX_AI_BACKGROUND"
queue tts "$MAX_TTS"
