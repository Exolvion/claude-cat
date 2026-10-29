export type Coat = 'tabby' | 'smoke' | 'midnight' | 'tuxedo' | 'cream'

export type DiaryEntry = { t: number; text: string }

/** How the prompt-line cat is drawn: big or small pixels, line art, or a one-line face. */
export type Look = 'big' | 'small' | 'ascii' | 'face'
/** Which end of the line it sits at. */
export type Side = 'right' | 'left'
/** The words beside it: its name and mood, only news such as "+1 kibble", or nothing. */
export type Caption = 'mood' | 'news' | 'off'

/** The cat itself: saved in $.store between sessions. */
export type CatData = {
  name: string
  coat: Coat
  hunger: number
  mood: number
  energy: number
  bowl: number
  treats: number
  treatsDay: string
  born: number
  savedAt: number
  hidden: boolean
  look: Look
  side: Side
  caption: Caption
  log: DiaryEntry[]
}

/** What the drawings say right now: the mood, a passing note, whether the room is open. */
export type CatView = {
  kind: string
  note: string
  flash: string
  isRoomOpen: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-cat': { cat: CatData; view: CatView }
  }
}
