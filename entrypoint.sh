#!/bin/bash
set -e

MYSQL_HOST="${MYSQL_HOST:-shared-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-root}"
DB_NAME="${DB_NAME:-ai_mom_db}"

echo "Waiting for MySQL at ${MYSQL_HOST}:${MYSQL_PORT}..."
until (echo > /dev/tcp/${MYSQL_HOST}/${MYSQL_PORT}) 2>/dev/null; do
  sleep 1
done
echo "MySQL is ready"

echo "Ensuring database '${DB_NAME}' exists..."
mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${DB_USER}" -p"${DB_PASSWORD}" \
  -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;" 2>/dev/null \
  && echo "Database '${DB_NAME}' is ready" \
  || echo "Warning: Could not create database (may already exist or permissions issue)"

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/mom.conf
