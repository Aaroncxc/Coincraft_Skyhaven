================================================================================
FFmpeg – Windows 64-bit Static Build (Essentials)
================================================================================

Quelle:     https://www.gyan.dev/ffmpeg/builds/
Build-Typ:  git-essentials (statisch gelinkt, keine DLL-Abhängigkeiten)

Version:    2026-02-23-git-7b15039cdb-essentials_build
Lizenz:     GPL v3
Quellcode:  https://github.com/FFmpeg/FFmpeg/commit/7b15039cdb

--------------------------------------------------------------------------------
Enthaltene Programme
--------------------------------------------------------------------------------

  ffmpeg    – Konvertierung, Transcoding, Filter, Streaming
  ffplay    – Einfacher Mediaplayer (SDL2)
  ffprobe   – Metadaten und Stream-Analyse

--------------------------------------------------------------------------------
Build-Kernpunkte
--------------------------------------------------------------------------------

  • Architektur: x86_64 (64-bit), Windows
  • Linking:     static (shared: nein)
  • Netzwerk, Threading (pthreads), experimentelle Features: ja
  • Viele gängige Decoder/Encoder; vollständige Listen siehe offizielle Doku

--------------------------------------------------------------------------------
Wichtige externe Bibliotheken (Auszug)
--------------------------------------------------------------------------------

  Audio/Video:  libx264, libx265, libvpx, libaom (AV1), libopus, libvorbis,
                libmp3lame, libwebp, libopenjpeg, …
  Untertitel:   libass, libfreetype, libfribidi, libharfbuzz
  Sonstiges:    zlib, bzlib, lzma, gnutls, sdl2, cairo, …

--------------------------------------------------------------------------------
Hardware-Beschleunigung (Windows / GPU)
--------------------------------------------------------------------------------

  NVIDIA:  cuda, cuvid, nvdec, nvenc, ffnvcodec
  AMD:     amf
  Intel:   qsv (über libmfx / libvpl), teils d3d11va / d3d12va
  Allgemein: dxva2, d3d11va, d3d12va, mediafoundation

  Hinweis: Verfügbarkeit hängt von Treiber, GPU und gewähltem Codec ab.

--------------------------------------------------------------------------------
Nutzung in diesem Projekt (Skyhaven)
--------------------------------------------------------------------------------

  Entweder den Ordner zum PATH hinzufügen oder ffmpeg mit vollem Pfad aufrufen,
  z. B.:

    skyhaven\tools\ffmpeg-2026-02-23-git-7b15039cdb-essentials_build\bin\ffmpeg.exe

  Beispiel (Video zu Bildsequenz):

    ffmpeg -i input.mp4 -vf fps=1 frame_%04d.png

--------------------------------------------------------------------------------
Dokumentation & Support
--------------------------------------------------------------------------------

  Handbuch:  https://ffmpeg.org/documentation.html
  Builds:    https://www.gyan.dev/ffmpeg/builds/ (auch „full“-Build mit mehr
             optionalen Features, falls essentials nicht reicht)

================================================================================
Die ursprüngliche README war ein vollständiges Build-Manifest (alle aktivierten
Decoder, Encoder, Demuxer, Muxer, Parser, HWAccels). Bei Bedarf kann die
Konfiguration mit „ffmpeg -version“ oder „ffmpeg -buildconf“ lokal geprüft
werden.
================================================================================
