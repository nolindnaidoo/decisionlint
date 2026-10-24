#!/usr/bin/env sh
# One-off: a GitHub Release for each existing tag that has none, with the
# tag's changelog section as its notes. No VSIX is attached, because the
# builds those versions shipped are not reproducible byte for byte. A tag
# whose version has no dated changelog section is reported and skipped, and
# so is a changelog version with no tag. Run from the repository root with
# `gh` signed in. It creates nothing until told to:
#
#   scripts/backfill-releases.sh            # says what it would create
#   scripts/backfill-releases.sh --create   # creates it
set -eu
mode=${1:-}
if [ -n "$mode" ] && [ "$mode" != "--create" ]; then
	echo "usage: backfill-releases.sh [--create]" >&2
	exit 2
fi
for tag in $(git tag -l 'v*' | sort -V); do
	version=${tag#v}
	if gh release view "$tag" >/dev/null 2>&1; then
		echo "$tag: release exists"
		continue
	fi
	if ! notes=$(scripts/changelog-section.sh "$version" 2>/dev/null); then
		echo "$tag: no dated changelog section, skipped"
		continue
	fi
	if [ "$mode" != "--create" ]; then
		echo "$tag: would create, $(printf '%s\n' "$notes" | wc -l | tr -d ' ') lines of notes"
		continue
	fi
	printf '%s\n' "$notes" | gh release create "$tag" --title "$version" --notes-file - --verify-tag
	echo "$tag: created"
done
for version in $(grep -o '^## [0-9][0-9.]*' CHANGELOG.md | cut -c4-); do
	git rev-parse -q --verify "refs/tags/v$version" >/dev/null || echo "v$version: in CHANGELOG.md, no tag, nothing made"
done
