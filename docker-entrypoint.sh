#!/bin/sh
set -eu

data_dir=/app/data

mkdir -p "$data_dir"
if ! chown -R node:node "$data_dir"; then
  echo "Nie można nadać użytkownikowi node praw do $data_dir." >&2
  echo "Sprawdź uprawnienia katalogu ./data na hoście." >&2
  exit 1
fi

exec setpriv --reuid=node --regid=node --init-groups "$@"
