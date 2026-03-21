# Coincraft Skyhaven

Desktop-Widget-Spiel: **isometrische Insel**, React-UI, **Three.js**-Szene, verpackt mit **Tauri 2**. Der Anwendungscode liegt im Ordner [`skyhaven/`](skyhaven/).

## Voraussetzungen

- [Node.js](https://nodejs.org/) (LTS empfohlen)
- [Rust](https://rustup.rs/) (für Tauri-Builds)
- Windows: ggf. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) für `tauri build`

## Schnellstart

```bash
cd skyhaven
npm install
npm run tauri dev
```

Nur Web-Frontend (ohne Tauri-Fenster):

```bash
cd skyhaven
npm install
npm run dev
```

Build der Desktop-App:

```bash
cd skyhaven
npm run tauri build
```

## Nützliche npm-Scripts (in `skyhaven/`)

| Script | Beschreibung |
|--------|----------------|
| `npm run dev` | Vite-Dev-Server |
| `npm run build` | TypeScript + Produktions-Build |
| `npm run preview` | Vorschau des statischen Builds |
| `npm run tauri` | Tauri-CLI (z. B. `npm run tauri dev`) |
| `npm run match:island` | PowerShell: Island-Tiles abgleichen |
| `npm run extract:char-frames` | PowerShell: Char-Frames extrahieren |

## Technologie-Stack

- **Frontend:** React 19, TypeScript, Vite 7
- **3D:** Three.js, React Three Fiber, Drei
- **Desktop:** Tauri 2

## Dokumentation im Repo

- [`skyhaven/docs/PLAYER_CAMERA_AND_CONTROLLER.md`](skyhaven/docs/PLAYER_CAMERA_AND_CONTROLLER.md) – Kamera & Steuerung
- **FFmpeg** (optional, z. B. für Asset-Pipeline): [`skyhaven/tools/ffmpeg-2026-02-23-git-7b15039cdb-essentials_build/README.txt`](skyhaven/tools/ffmpeg-2026-02-23-git-7b15039cdb-essentials_build/README.txt)

## Cursor / KI-Hinweise

Projektregeln und Skills liegen unter [`.cursor/rules/`](.cursor/rules/) und [`.claude/skills/`](.claude/skills/) (u. a. Isometrie, UI/HUD, Tauri-Shell).

---

*Produktname in Tauri: **Skyhaven** (`skyhaven/src-tauri/tauri.conf.json`).*
