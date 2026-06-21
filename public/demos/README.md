# Interactive build demos

These folders feed the "Try it out" buttons in the build zoom panels.

## Fluent

Drop the single self-contained assessment file at:

    public/demos/fluent/index.html

That's it. The "Take the assessment" button loads it full screen in an iframe,
with an "Open in new tab" option. Until the file is there, the overlay shows a
clean "not installed yet" state (no errors).

## Taffy

INSTALLED. The nine raw + nine processed stems (kick, kickout, snare, snarebot,
racktom, floortom, oh-left, oh-right, room) are ~1-minute (24-bar, ~62.7s)
OGG Vorbis loops (~92 BPM, 44.1k mono, ~530KB each, ~6MB total) cut from ~49s
into the song, where it builds out of the verse into the tom-rich chorus, so the
loop has real rack + floor tom fills and a lot of dynamic range. Made from
Justin's real multitrack: raw stems from one Drive folder, processed stems (the
drum mics of a finished song mix) from another. Source WAVs were 44.1k vs 48k and
slightly offset, so they were resampled to a common rate and aligned by
cross-correlating the kick onsets; loop length was refined to the groove period;
the SAME window is trimmed from raw and processed (sample-locked for the auto-mix
crossfade), with a short crossfade baked at the loop seam. OGG Vorbis keeps a
full minute at ~6MB and decodes gaplessly in modern browsers (Safari 15+). The
loader prefers .ogg, then .wav, then .mp3.

    public/demos/taffy/raw/<id>.wav   # the unprocessed mic
    public/demos/taffy/mix/<id>.wav   # the same mic after Taffy's auto-mix

Track ids (one file each; loader tries .wav then .mp3):

    kick, snare, racktom, floortom, oh-left, oh-right, room

Notes / to regenerate or swap:
- raw/<id> and mix/<id> must be the SAME performance, SAME length, and a
  seamless loop (the console hard-loops them). WAV is used because mp3/ogg add
  decoder padding that clicks on a hard loop.
- Any missing stem falls back to a synthesized stand-in; when all real files are
  present the "demo kit" badge in the header disappears.
- Fader starting levels (raw = unity), pan, mixDb targets, and EQ curves per
  track live in `src/taffy/tracks.ts`.

### AI bleed removal pass (mix stems)

The six drum close-mics in `mix/` (kick, kickout, snare, snarebot, racktom,
floortom) have been run through Taffy's real trained bleed-removal nets offline
(the `~/Documents/Claude/Projects/Drum Plugin/Models/blind_sep_*.onnx` models).
Originals are preserved in `mix/_original_pre_debleed/`. OH + room are left
untouched (they're meant to be the whole kit).

- Models are STFT mask nets (1024 FFT / 256 hop / 513 bins, 128-frame tiles).
- `Drum Plugin/Training/clean_drums.py` is the stock single-mic runner, but its
  final `y = y/peak` normalize crushes a file when masking leaves an STFT
  overlap-add edge spike (the "snare disappeared" bug). The corrected offline
  cleaner (kept at `/tmp/debleed_mm.py` during the session) zero-pads the edges,
  trims back to the exact original length (sample-locked to `raw/` for the
  crossfade), and RMS-matches the output so loudness is preserved.
- Snares use a **hi-focus** variant: the mask is applied only above ~3 kHz so the
  snare body is 100% untouched and only cymbal/hi-hat bleed comes down (~57% of
  the >10 kHz air). Kick/toms use the gentle full-band mask at blend 0.85.
- Re-encode mono OGG/Vorbis via soundfile, NOT ffmpeg (this ffmpeg build has no
  libvorbis and its native vorbis encoder is stereo-only):
  `sf.write(path, y, sr, format='OGG', subtype='VORBIS')`.
