#!/bin/sh
# What: pull CourseBook once after Postgres is up. Does not run during image build.
# Input: NEBULALABS_API_KEY, ANONYMIZATION_KEY, optional COURSEBOOK_TERM / COURSEBOOK_PREFIX
# Output: upserts source-backed tables, or skip/keep existing rows and exit 0
set -eu

key=${NEBULALABS_API_KEY:-}
anon=${ANONYMIZATION_KEY:-}
term=${COURSEBOOK_TERM:-26F}
prefix=${COURSEBOOK_PREFIX:-CS}

case "$key$anon" in
  ""|*replace-with*)
    echo "Skipping CourseBook ingest: set NEBULALABS_API_KEY and ANONYMIZATION_KEY in .env"
    exit 0
    ;;
esac

echo "Pulling CourseBook $prefix $term..."
if python ingest.py --term "$term" --prefix "$prefix"; then
  exit 0
fi

echo "CourseBook ingest failed; existing rows were kept"
exit 0
