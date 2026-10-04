#!/bin/zsh
# Guard: fail if relocation wording about Justin reappears in the resume/portfolio source.
# Justin, 2026-10-02: "I'm not moving. Remote only."
# Affirmative forms only: the remote-only instruction itself names San Francisco and New York.
# Narrow on purpose: ignores the SF Mono font, soundfile sf.write, and the band's move to Baltimore.
# Usage: check-no-relocation.sh [repo_root]   (exit 0 = clean, exit 1 = stale wording found)
root="${1:-.}"
pattern='open to (SF|NYC|San Francisco|New York|relocat)|(willing|able|happy|open) to relocate|relocat(e|ion|ing) to (SF|NYC|San Francisco|New York)|(SF|NYC) ?/ ?(SF|NYC)|open to moving'
hits=$(grep -rnIiE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.vercel \
  --exclude=check-no-relocation.sh -e "$pattern" "$root")
if [[ -n "$hits" ]]; then
  echo "STALE RELOCATION WORDING (Justin is remote only):"
  echo "$hits"
  exit 1
fi
echo "clean: no relocation wording"
exit 0
