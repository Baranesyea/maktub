// Fonts available in the two development font menus.
// "mine" = the user's Fontbit fonts (loaded from a local stylesheet that is not in the public repo).
export const FONTS = [
  { id: 'gofan', name: 'גופן סאנס', css: "'Fb Gofan Sans', 'Assistant', sans-serif", kind: 'sans', mine: true, ui: true, write: true },
  { id: 'hamahapecha', name: 'המהפכה', css: "'Fb Hamahapecha', 'Assistant', sans-serif", kind: 'sans', mine: true, ui: true, write: true },
  { id: 'basis', name: 'בסיס מעובה', css: "'Fb Basis Condensed', 'Assistant', sans-serif", kind: 'sans', mine: true, ui: true, write: false },
  { id: 'mockup', name: 'מוקאפ (כתב יד)', css: "'Fb Mockup', 'Assistant', sans-serif", kind: 'hand', mine: true, ui: false, write: true },
  { id: 'assistant', name: 'אסיסטנט', css: "'Assistant', system-ui, sans-serif", kind: 'sans', ui: true, write: true },
  { id: 'heebo', name: 'היבו', css: "'Heebo', system-ui, sans-serif", kind: 'sans', ui: true, write: true },
  { id: 'rubik', name: 'רוביק', css: "'Rubik', system-ui, sans-serif", kind: 'sans', ui: true, write: true },
  { id: 'noto-sans', name: 'נוטו סאנס עברית', css: "'Noto Sans Hebrew', system-ui, sans-serif", kind: 'sans', ui: true, write: true },
  { id: 'plex', name: 'איי בי אם פלקס עברית', css: "'IBM Plex Sans Hebrew', system-ui, sans-serif", kind: 'sans', ui: true, write: true },
  { id: 'frank', name: 'פרנק רוהל', css: "'Frank Ruhl Libre', serif", kind: 'serif', ui: false, write: true },
  { id: 'david', name: 'דוד ליברה', css: "'David Libre', serif", kind: 'serif', ui: false, write: true },
  { id: 'noto-serif', name: 'נוטו סריף עברית', css: "'Noto Serif Hebrew', serif", kind: 'serif', ui: false, write: true },
]
export const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[4]
export const DEFAULT_UI_FONT = 'gofan'
export const DEFAULT_WRITE_FONT = 'frank'
