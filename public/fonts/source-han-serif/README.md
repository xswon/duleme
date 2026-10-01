# Offline reading font

Source: Adobe **Source Han Serif SC Regular 2.003**, downloaded from
https://github.com/adobe-fonts/source-han-serif/tree/release/OTF/SimplifiedChinese
on 2026-10-01. SIL Open Font License 1.1 is retained in LICENSE.txt.

These modified, unhinted horizontal-reading subsets use the internal family
**WReader Reading Serif**, respecting the upstream reserved font names.
They retain the Simplified Chinese default glyphs and Latin kerning/ligatures.

Rebuild using `scripts/subsetReaderFont.py` and the upstream OTF, with
`fonttools[woff]` installed in a temporary Python environment.

48 local WOFF2 shards total 7,737,688 bytes (7.38 MiB). The common shard is
841,740 bytes (GB2312 first-level Han, Latin and punctuation); other shards
cover remaining available BMP Han U+3400–U+9FFF. CSS unicode-range loads only
shards needed by the rendered text, and the stylesheet is inserted only after
selecting serif. Nothing is downloaded from a third-party CDN at runtime.
`font-display: swap` keeps article text visible throughout loading.

CJK characters outside these ranges, missing glyphs or failed resources fall
back to Songti SC / STSong / SimSun / Noto Serif CJK SC / the platform serif.
Only regular weight is bundled to control size; emphasis may be synthesized.
