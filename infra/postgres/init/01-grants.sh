#!/bin/sh
# Schema grants in each application database (run by the postgres image after 00-roles.sql).
set -eu
for db in academybee academybee_test academybee_shadow; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$db" -f /docker-entrypoint-initdb.d/sql/grants.sql
done
