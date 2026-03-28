# Portfolio-Screenshots

Sechs Referenzbilder für PDF/Website. **Automatisch:** bei laufendem Dev-Server (`npm run dev` im Ordner `skyhaven/`):

```bash
npm run capture:portfolio
```

Ausgabe (PNG):

| Datei | Inhalt |
|--------|--------|
| `01_main_ingame.png` | Insel + HUD + Uhr nach Intro |
| `02_main_menu_open.png` | Sidebar „Main Menu“ |
| `03_shop_placeholders.png` | Shop-Einträge (UI-Stubs) |
| `04_islands_home_custom.png` | Insel „Home“ (Custom) |
| `05_toolbox_panel.png` | Toolbox auf Custom-Insel |
| `06_planner.png` | Planner / Daily Quests |

**Manuell:** Viewport ca. **960×618** (entspricht erweitertem Widget), `npm run dev`, Intro mit **Start** schließen, dann dieselben Zustände einfangen.

**Tag/Nacht:** In den Optionen oder über Debug/Beleuchtung (je nach Build) Nachtmodus aktivieren und zusätzlich `*_night.png` anlegen, falls du zwei Lichtstimmungen brauchst.

**GIFs:** z. B. OS-Tools oder ScreenToGif; kurze Loop: Insel drehen/zoomen oder Sidebar öffnen.
