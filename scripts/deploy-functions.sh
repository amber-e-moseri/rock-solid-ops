#!/bin/bash
PROJECT_REF="xelpsttqhrcqmttmjory"
FUNCTIONS="registration-processor moodle-sync email-sender retry-worker reminder-processor scheduled-notification-sender notification-dispatcher phase2-processor"

for fn in $FUNCTIONS; do
  echo "Deploying $fn..."
  supabase functions deploy $fn --no-verify-jwt
done

echo "All functions deployed with JWT disabled."
