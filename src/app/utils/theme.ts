// Tema claro/escuro: segue o tema do telemóvel/sistema até o utilizador escolher um
// manualmente (botão ☀/🌙). Escolher de novo o mesmo tema do sistema volta ao automático.
//
// crm_tema_mode   → último tema aplicado ('light' | 'dark'), lido pelo resto do app
// crm_tema_source → 'manual' quando o utilizador fixou o tema; ausente = segue o sistema

export type ThemeMode = 'light' | 'dark';

const MODE_KEY = 'crm_tema_mode';
const SOURCE_KEY = 'crm_tema_source';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export const systemTheme = (): ThemeMode => (darkQuery().matches ? 'dark' : 'light');

function isManual(): boolean {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'manual';
  } catch {
    return false;
  }
}

/** Tema a usar agora: o escolhido manualmente, ou o do sistema. */
export function resolveTheme(): ThemeMode {
  if (isManual()) {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // storage indisponível — segue o sistema
    }
  }
  return systemTheme();
}

export function applyThemeClass(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

/** Escolha manual do utilizador. Igual ao sistema → volta a seguir o sistema. */
export function saveThemeChoice(mode: ThemeMode) {
  try {
    if (mode === systemTheme()) localStorage.removeItem(SOURCE_KEY);
    else localStorage.setItem(SOURCE_KEY, 'manual');
  } catch {
    // ignore
  }
  applyThemeClass(mode);
}

/** Avisa quando o tema do sistema muda e o utilizador não fixou um tema. */
export function onSystemThemeChange(callback: (mode: ThemeMode) => void): () => void {
  const query = darkQuery();
  const listener = () => {
    if (!isManual()) callback(systemTheme());
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Aplica o tema no arranque e mantém-no sincronizado com o sistema. */
export function initTheme() {
  applyThemeClass(resolveTheme());
  onSystemThemeChange(applyThemeClass);
}
