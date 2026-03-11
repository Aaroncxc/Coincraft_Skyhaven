# Skyhaven (CoinCraft: Skyhaven) — Game Design Document (GDD) v0.1
**Genre:** Cozy Desktop-Widget Idle / Focus Game  
**Inspiration:** „Rusty’s Retirement“-Prinzip (läuft nebenbei während du arbeitest), aber mit isometrischen Floating Islands + Action-Focus (Mining/Farming/Roaming).  
**Plattform:** Desktop (Windows/macOS)  
**Tech:** Tauri + Vite + TypeScript (Canvas2D oder PixiJS)

---

## 0) One-Liner
**Skyhaven ist ein kleines, wunderschönes Desktop-Widget-Spiel, das am Bildschirmrand mitläuft: Dein Charakter lebt auf isometrischen Inseln, du wählst eine Focus-Aktion (z. B. Mining/Farming/Roaming) für 30/60/120 Minuten, und während du arbeitest, sammelt er Ressourcen, Loot und Cosmetics — ohne dich zu stressen.**

---

## 1) Design Pillars
1. **Nebenbei spielbar (Low Attention, High Reward)**  
   Kein permanentes Klicken nötig. Kurze Entscheidungen → lange, befriedigende Progression.
2. **Cozy + “Satisfying” Interaction**  
   Micro-Feedback: Tile-Hover-Springs, weiche UI-Animationen, edle Linien, angenehme Sounds.
3. **Progression ohne Frust**  
   Kein hartes Fail-State. Fortschritt durch Routine, Sammlungen, Unlocks, Upgrades.
4. **Widget-First UX**  
   Always-ready, schnell, minimal, optional „Always on Top“, kein CPU-Hunger.

---

## 2) Zielgruppe
- People, die am PC arbeiten (Designer, Devs, Students) und ein „cozy companion“ Game wollen.
- Fans von Idle/Farm/Collection und minimalem Management.
- Spieler, die lieber *Routine & Sammeln* statt Stress mögen.

---

## 3) Core Gameplay Loop
### 3.1 Macro Loop (Tages-/Wochen-Loop)
1. Spieler öffnet Widget → sieht Insel + HUD + Status.
2. Spieler wählt **Focus Action**: Mining / Farming / Roaming (+ Dauer).
3. Charakter führt Aktion autonom aus (läuft, arbeitet, sammelt).
4. Session endet → **Rewards** (Coins, Materials, EXP, Rare Cosmetics).
5. Rewards werden genutzt für:
   - **Upgrades** (Gear, Tools, Stamina)
   - **Unlocks** (neue Tiles/Islands/POIs)
   - **Cosmetics/Collection** (Meta-Motivation)

### 3.2 Micro Loop (Moment-to-Moment)
- Hover über Tiles → „springy“ Bounce + minimaler Neighbor-Push.
- Klick auf POI/Tile → Kontextaktionen (Start Focus, Inspect, Place/Harvest).
- UI zeigt sehr klar: was läuft gerade + wie lange noch.

---

## 4) Game World & Insel-System
### 4.1 Isometric Floating Islands
- Inseln bestehen aus Tiles (Grid).  
- Jede Insel hat 1–3 **Points of Interest (POI)** (z. B. Mine, Farm, Shopkeeper später).
- Inseln können „expanded“ werden (zusätzliche Tile-Reihen freischalten).

### 4.2 Tile Types (Beispiele, aus euren Sheets)
- **Crop Tiles:** empty / half-grown / full-grown  
- **Path Tiles:** stone cross / stone straight / dirt lantern path  
- **Props:** Oaks (Varianten), Deko  
- **POI Tiles:** POI_FARMING, POI_MINING

### 4.3 POIs (erste Version)
- **Mine POI**
  - Focus Action: Mining
  - Outputs: Ore, Coins, Rare Cosmetic Drop-Chance
- **Farm POI**
  - Focus Action: Farming
  - Outputs: Crops, Seeds, Cooking later, Cosmetic Drop-Chance (optional)

---

## 5) Focus Actions System (Rusty-like)
### 5.1 Focus Actions
- **Mining**: Charakter geht zur Mine, „arbeitet“ in Loop, generiert Ressourcen.
- **Farming**: Charakter geht zur Farm, pflanzt/erntet im Loop oder arbeitet „Farm Spots“ ab.
- **Roaming**: Charakter läuft gemütlich rum, kleine Finds, Discovery, Ambient Rewards.

### 5.2 Session Durations
- 30 min / 60 min / 120 min  
- Je länger, desto:
  - bessere durchschnittliche Rewards/min (leicht)
  - höhere Rare Drop Chance

**Beispiel (aus eurer Farming-Note, Werte später balancen):**
- 30 min: 0.3% rare cosmetic
- 60 min: 0.5% rare cosmetic
- 120 min: 0.9% rare cosmetic

### 5.3 Gear Gating (aus eurer Spec)
- **Mit Gear:** Fokus-Aktion am POI startbar, voller Loot-Pool.
- **Ohne Gear:** Insel ist „safe roam“ → keine Mine/Farm Interaktion, nur Roaming.

### 5.4 Offline Progress / Widget-Prinzip
- Session basiert auf `endsAt` Timestamp.
- App kann geschlossen werden: beim Reopen → Rewards sofort ausgeben, wenn Zeit abgelaufen.

---

## 6) Character Autonomy
### 6.1 Verhalten
- Idle (stehen, kurze Pausen)
- Roam (random reachable tiles)
- GoToPOI (zur Mine/Farm laufen)
- Working (loop animation + VFX)
- Return/Cooldown (optional)

### 6.2 Movement
- Grid Pathing (A* minimal) oder „smart greedy“ (für kleine Inseln ok).
- Screen tweening, time-based.

---

## 7) Economy, Rewards & Progression
### 7.1 Ressourcen-Kategorien
- **Soft Currency:** Coins
- **Materials:** Ore, Wood, Crops
- **Meta:** EXP, Stamina
- **Cosmetics:** Rare drops (Sammlungs-Drive)

### 7.2 EXP & Stamina
- EXP: Level progression (unlock islands/tiles/tools).
- Stamina: „Daily energy“ für Focus Actions oder als balancing knob.
  - Roaming kann stamina-free sein (cozy mode).
  - Mining/Farming kostet stamina pro Session (balancing).

### 7.3 Inventory
- Quick Slots (oben im HUD) + Full Inventory (Sidebar).
- Items: stackable, rarity, type (material/gear/cosmetic).

### 7.4 Shop (später/Phase 2)
- Buy tools, seeds, cosmetics rotation.
- Sink für Coins, Soft economy control.

---

## 8) UI/UX (Widget-first)
### 8.1 Layout (wie in euren Screens)
- **Top HUD:** EXP-Bar + Stamina-Bar
- **Left Sidebar:**  
  Main Menu  
  Inventory  
  Focus Actions (Mining / Roaming / Farming)  
  Shop  
  Options
- **Bottom-left Status Tag:** „MINING…“ / „FARMING…“
- **Big Clock Overlay:** sehr groß, low opacity, hinter der Insel.

### 8.2 Interaction Feedback
- Tile hover: federnde Micro-Motion („satisfying“) + minimaler neighbor push.
- POI hover: subtiler Highlight/Arrow (nicht zu laut).
- Klick: kurzer Pulse, optional kleiner Sound.

### 8.3 UX Regeln (wichtig fürs Prinzip)
- 1–2 Klicks um eine Session zu starten.
- Rewards sofort verständlich und befriedigend.
- Keine UI-Overlaps, keine clutter.

---

## 9) Audio & Feel
- Minimalistische Ambient Loops (Wind/Clouds, leise Natur).
- Subtile UI Clicks + „soft“ reward chimes.
- Working SFX (Pickaxe, farming rustle) sehr leise und abschaltbar.

---

## 10) Art Direction
- Isometrisch, warm, painterly, cozy-fantasy.
- UI: modern-minimal, leicht „tool-like“, edel (dünne Linien, weiche Schatten, klare Typo).
- Animationen: wenige, aber hochwertig (Springs, easing, micro VFX).

---

## 11) Technical Design (Tauri)
### 11.1 Client Architektur
- `GameState` Store (Focus session, inventory, stats)
- `Renderer` (canvas/pixi)
- `UI` (React)
- `Persistence` (localStorage / IndexedDB optional)

### 11.2 Daten (JSON-driven)
- Inseln: `island.json` (tiles, poi, spawn)
- Loot tables: `lootTables.json`
- Items: `items.json`
- Settings: `settings.json`

### 11.3 Performance Targets
- 60 FPS idle/normal
- Keine busy loops
- Throttle bei minimized/hidden window

---

## 12) Content Plan (Roadmap)
### MVP (Vertical Slice)
- 1 Insel (Mining oder Farming)
- Hover springs
- Focus actions (30/60/120)
- Timer overlay
- Rewards + Inventory stub
- EXP/Stamina UI (mock ok)

### v0.2 (Playable)
- 2 POIs (Mine + Farm)
- Gear gating (basic)
- Simple shop
- Basic progression unlocks

### v0.3 (Retention)
- Cosmetics collection system
- Multiple islands / biome variations
- Seasonal content (Events)

---

## 13) Success Criteria
- Spieler startet innerhalb von 10 Sekunden eine Focus-Session.
- Spieler versteht ohne Tutorial: was läuft, wie lange, was es bringt.
- UI fühlt sich „premium“ an, nicht wie ein typisches idle mobile game.
- Das Widget stört beim Arbeiten nicht (CPU low, optional always-on-top, clean).

---

## 14) Offene Entscheidungen (für euch)
1. **Renderer:** PixiJS vs Canvas2D (Pixi sinnvoll für scaling/atlases)
2. **Widget Behavior:** always-on-top default? oder optional toggle?
3. **Stamina:** echter limiter oder nur „soft balancing“?
4. **Rare Drops:** cosmetics-only oder auch gear?
5. **Session-Farming:** echt „crop states“ in-world oder abstrakt als session output?
