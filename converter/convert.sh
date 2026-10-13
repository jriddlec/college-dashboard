#!/usr/bin/env bash
# Convert every Office file under /library to a PDF under /previews, at the
# same relative path plus ".pdf" (Lab 04.docx -> Lab 04.docx.pdf). Previews
# newer than their original are skipped; previews whose original is gone are
# removed. Safe to re-run any time.
set -uo pipefail
LIB=/library OUT=/previews WORK=/tmp/convert
mkdir -p "$WORK"
converted=0 failed=0

while IFS= read -r -d '' f; do
  rel=${f#"$LIB"/}
  dest="$OUT/$rel.pdf"
  [[ -f "$dest" && "$dest" -nt "$f" ]] && continue
  mkdir -p "$(dirname "$dest")"
  base=$(basename "$f")
  rm -f "$WORK"/*
  if timeout 300 soffice -env:UserInstallation=file:///tmp/lo-profile --headless --norestore --convert-to pdf --outdir "$WORK" "$f" >/dev/null 2>&1 \
     && [[ -f "$WORK/${base%.*}.pdf" ]]; then
    mv "$WORK/${base%.*}.pdf" "$dest"
    echo "converted: $rel"
    converted=$((converted + 1))
  else
    echo "FAILED:    $rel" >&2
    failed=$((failed + 1))
  fi
done < <(find "$LIB" -type f \( -iname '*.docx' -o -iname '*.doc' -o -iname '*.pptx' -o -iname '*.ppt' \
          -o -iname '*.xlsx' -o -iname '*.xls' -o -iname '*.odt' -o -iname '*.odp' -o -iname '*.rtf' \) \
          ! -name '~$*' -print0)

removed=0
while IFS= read -r -d '' p; do
  rel=${p#"$OUT"/}
  if [[ ! -f "$LIB/${rel%.pdf}" ]]; then rm -f "$p"; removed=$((removed + 1)); fi
done < <(find "$OUT" -type f -name '*.pdf' -print0)
find "$OUT" -mindepth 1 -type d -empty -delete

echo "done: $converted converted, $failed failed, $removed stale removed"
[[ $failed -eq 0 ]]
