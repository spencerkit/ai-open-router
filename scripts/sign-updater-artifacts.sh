#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "TAURI_SIGNING_PRIVATE_KEY is required to sign updater artifacts"
  exit 1
fi

shopt -s nullglob

sign_artifact() {
  local source_file="$1"
  local sig_file="${source_file}.sig"

  [[ -f "${source_file}" ]] || return 0

  if [[ -f "${sig_file}" ]]; then
    echo "signature exists: $(basename "${sig_file}")"
    return 0
  fi

  cargo tauri signer sign "${source_file}"
  echo "signed: $(basename "${source_file}")"
}

for file in \
  "${DIST_DIR}"/*.app.tar.gz \
  "${DIST_DIR}"/*-setup.exe \
  "${DIST_DIR}"/*-setup.exe.zip \
  "${DIST_DIR}"/*.msi \
  "${DIST_DIR}"/*.msi.zip \
  "${DIST_DIR}"/*.AppImage \
  "${DIST_DIR}"/*.AppImage.tar.gz \
  "${DIST_DIR}"/*.deb \
  "${DIST_DIR}"/*.rpm
do
  sign_artifact "${file}"
done

echo "updater artifacts signed in ${DIST_DIR}"
