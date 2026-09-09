#!/bin/sh
set -eu

node /repo/apps/api/dist/index.js &
api_pid=$!

nginx -g "daemon off;" &
nginx_pid=$!

cleanup() {
  kill "$api_pid" "$nginx_pid" 2>/dev/null || true
  wait "$api_pid" "$nginx_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done

exit 1
