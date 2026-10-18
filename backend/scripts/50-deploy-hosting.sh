#!/bin/sh
# Prints the commands. Does not run them.
# Writes a temp config at the repo root (public: frontend/dist is relative to the config file).
# firebase deploy --config is supported by firebase-tools; if missing, merge "site" locally
# without committing firebase.json / .firebaserc.
# Fallback if jq is unavailable:
#   node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync("firebase.json","utf8")); j.hosting.site=process.argv[1]; fs.writeFileSync("firebase.deploy.local.json", JSON.stringify(j, null, 2) + "\n")' "<site-id>"
set -eu

PROJECT="${PROJECT:-krayon-ai}"
SITE=""
CREATE=0

usage() {
  cat <<'EOF'
Usage: sh backend/scripts/50-deploy-hosting.sh --site <site-id> [options]

Print Hosting build and deploy commands. Does not run them.

  --site <site-id>    Firebase Hosting site id (required). Not stored in git.
  --project <id>      Firebase/GCP project (default: krayon-ai, or $PROJECT)
  --create            Also print firebase hosting:sites:create
  -h, --help          Show this help

Run the printed commands from the repo root. firebase.deploy.local.json is gitignored.

Example:
  sh backend/scripts/50-deploy-hosting.sh --site <site-id>
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --site)
      if [ "$#" -lt 2 ]; then
        echo "--site requires a value" >&2
        usage >&2
        exit 1
      fi
      SITE=$2
      shift 2
      ;;
    --project)
      if [ "$#" -lt 2 ]; then
        echo "--project requires a value" >&2
        usage >&2
        exit 1
      fi
      PROJECT=$2
      shift 2
      ;;
    --create)
      CREATE=1
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$SITE" ]; then
  echo "missing --site" >&2
  usage >&2
  exit 1
fi

echo "# Set VITE_API_BASE_URL (and other production VITE_*) in frontend/.env.production before building."
echo "# Add ${SITE}.web.app and ${SITE}.firebaseapp.com to Firebase Auth authorized domains and the reCAPTCHA Enterprise key domains."
if [ "$CREATE" -eq 1 ]; then
  echo "firebase hosting:sites:create ${SITE} --project ${PROJECT}"
fi
echo "npm run build -w frontend"
echo "jq --arg site '${SITE}' '.hosting.site = \$site' firebase.json > firebase.deploy.local.json"
echo "firebase deploy --only hosting --project ${PROJECT} --config firebase.deploy.local.json"
echo "rm firebase.deploy.local.json"
