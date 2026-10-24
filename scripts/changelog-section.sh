#!/usr/bin/env sh
# Prints the body of one version's section of CHANGELOG.md: the lines after
# `## <version> — <date>` up to the next `## ` heading, blank lines at either
# end dropped. The heading itself is left out, because a GitHub Release
# carries the version as its title. Exits 1 and prints nothing when the
# version has no dated section, so no release is ever made with empty notes.
#
#   scripts/changelog-section.sh 1.1.0 > notes.md
#
# The Release workflow runs it for the version being released, and
# scripts/backfill-releases.sh for the tags released before it existed.
set -eu
version=${1:?usage: changelog-section.sh <version> [CHANGELOG.md]}
file=${2:-CHANGELOG.md}
awk -v v="$version" '
BEGIN {
	pattern = v
	gsub(/\./, "\\.", pattern)
	heading = "^## " pattern " — [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$"
}
found && /^## / { exit }
found { lines[n++] = $0 }
$0 ~ heading { found = 1 }
END {
	if (!found) {
		print "no dated section for " v " in " FILENAME > "/dev/stderr"
		exit 1
	}
	while (n > 0 && lines[n - 1] == "") n--
	start = 0
	while (start < n && lines[start] == "") start++
	for (i = start; i < n; i++) print lines[i]
}
' "$file"
