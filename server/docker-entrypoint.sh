#!/bin/sh
set -e

# Compose starts this once Postgres reports healthy, but a healthy server is
# not always an accepting one, so retry rather than crash-looping.
echo "⏳ Waiting for the database…"
for attempt in $(seq 1 30); do
  if npx prisma migrate deploy > /tmp/migrate.log 2>&1; then
    echo "✅ Migrations applied"
    break
  fi

  if [ "$attempt" = "30" ]; then
    echo "❌ Database never became reachable:"
    cat /tmp/migrate.log
    exit 1
  fi

  sleep 2
done

# The seed is upserts keyed on natural columns, so re-running it is a no-op
# rather than a duplicate. Set SEED_ON_START=false to skip it.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "🌱 Seeding demo data…"
  npm run seed
fi

echo "🚀 Starting the API"
exec "$@"
