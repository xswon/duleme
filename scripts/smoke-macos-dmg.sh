#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: smoke-macos-dmg.sh <arm64|x64>}"
case "$arch" in
  arm64) machine_pattern="arm64" ;;
  x64) machine_pattern="x86_64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 2 ;;
esac

dmg="$(find release -maxdepth 1 -type f -name "*-mac-${arch}.dmg" -print -quit)"
if [[ -z "$dmg" ]]; then
  echo "No ${arch} DMG found in release/" >&2
  exit 1
fi

mount_dir="$(mktemp -d)"
install_dir="$(mktemp -d)"
cleanup() {
  hdiutil detach "$mount_dir" -quiet 2>/dev/null || true
  rm -rf "$mount_dir" "$install_dir"
}
trap cleanup EXIT

hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mount_dir" >/dev/null
source_app="$(find "$mount_dir" -maxdepth 1 -type d -name "*.app" -print -quit)"
if [[ -z "$source_app" ]]; then
  echo "DMG does not contain an application bundle" >&2
  exit 1
fi

installed_app="$install_dir/$(basename "$source_app")"
ditto "$source_app" "$installed_app"

plist="$installed_app/Contents/Info.plist"
bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$plist")"
executable_name="$(plutil -extract CFBundleExecutable raw -o - "$plist")"
version="$(plutil -extract CFBundleShortVersionString raw -o - "$plist")"
executable="$installed_app/Contents/MacOS/$executable_name"

[[ "$bundle_id" == "com.duleme.reader" ]] || { echo "Unexpected bundle id: $bundle_id" >&2; exit 1; }
[[ -x "$executable" ]] || { echo "Packaged executable is missing: $executable" >&2; exit 1; }
file "$executable" | grep -q "$machine_pattern" || { file "$executable"; exit 1; }

echo "Mounted and copied $(basename "$dmg")"
echo "Bundle: $bundle_id · version $version · architecture $arch"

smoke_log="$install_dir/desktop-smoke.log"
"$executable" --smoke-test >"$smoke_log" 2>&1 &
smoke_pid=$!

for _ in {1..30}; do
  if ! kill -0 "$smoke_pid" 2>/dev/null; then
    set +e
    wait "$smoke_pid"
    smoke_status=$?
    set -e
    cat "$smoke_log"
    exit "$smoke_status"
  fi
  sleep 1
done

echo "Packaged app did not finish its smoke test within 30 seconds" >&2
cat "$smoke_log" >&2
kill "$smoke_pid" 2>/dev/null || true
wait "$smoke_pid" 2>/dev/null || true
exit 1
