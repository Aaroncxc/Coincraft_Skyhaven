const INTRO_MUSIC_SRC = "/ingame_assets/IntroScreen/Ruins at Golden Hour (Edit).mp3";

let introAudio: HTMLAudioElement | null = null;

/** Single shared intro track — avoids double playback from StrictMode / remounts. */
export function getIntroMusicElement(): HTMLAudioElement {
  if (!introAudio) {
    introAudio = new Audio(INTRO_MUSIC_SRC);
    introAudio.loop = true;
  }
  return introAudio;
}

export function stopIntroMusicCompletely(): void {
  if (!introAudio) return;
  introAudio.pause();
  introAudio.currentTime = 0;
  introAudio.src = "";
  introAudio.load();
  introAudio = null;
}
