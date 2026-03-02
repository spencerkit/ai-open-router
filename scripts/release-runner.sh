#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

EXPLICIT_FROM_TAG=""
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  if [[ "${ARGS[$i]}" == "--from-tag" ]] && [[ $((i + 1)) -lt ${#ARGS[@]} ]]; then
    EXPLICIT_FROM_TAG="${ARGS[$((i + 1))]}"
    break
  fi
done

LAST_TAG="${EXPLICIT_FROM_TAG}"
if [[ -z "${LAST_TAG}" ]]; then
  LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
fi

RANGE="HEAD"
EXTRA_ARGS=()

if [[ -n "${LAST_TAG}" ]]; then
  RANGE="${LAST_TAG}..HEAD"
  if [[ -z "${EXPLICIT_FROM_TAG}" ]]; then
    EXTRA_ARGS+=(--from-tag "${LAST_TAG}")
  fi
fi

git log "${RANGE}" --no-merges --pretty=format:%H%x1f%s%x1f%b%x1e |
  node ./scripts/release.js --commits-stdin "${EXTRA_ARGS[@]}" "${ARGS[@]}"
