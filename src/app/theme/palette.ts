import { alpha } from '@mui/material/styles';

// ----------------------------------------------------------------------
// Paleta portada de COPIA/src/theme/palette.ts (Minimal Kit), com a cor
// "primary" recalculada a partir do azul de marca já usado no LeadFlow
// (--primary: hsl(221 83% 53%) em src/app/styles/globals.css) em vez do
// verde original do tema de referência.
// ----------------------------------------------------------------------

export type ColorSchema = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';

declare module '@mui/material/styles' {
  interface TypeBackground {
    neutral: string;
  }
  interface SimplePaletteColorOptions {
    lighter: string;
    darker: string;
  }
  interface PaletteColor {
    lighter: string;
    darker: string;
  }
}

const GREY = {
  0: '#FFFFFF',
  100: '#F9FAFB',
  200: '#F4F6F8',
  300: '#DFE3E8',
  400: '#C4CDD5',
  500: '#919EAB',
  600: '#637381',
  700: '#454F5B',
  800: '#212B36',
  900: '#161C24',
};

// Azul de marca do LeadFlow (hsl 221 83% 53%), gerado nos mesmos 5 níveis
// de luminosidade que o Minimal Kit usa para as suas cores semânticas.
const PRIMARY_LIGHT_MODE = {
  lighter: '#DAE4FC',
  light: '#7CA2F3',
  main: '#2463EB',
  dark: '#1147BB',
  darker: '#0B2E79',
  contrastText: '#FFFFFF',
};

// Azul de marca do LeadFlow em modo escuro (hsl 221 70% 55%).
const PRIMARY_DARK_MODE = {
  lighter: '#CBD9F6',
  light: '#7D9FE8',
  main: '#3C6FDD',
  dark: '#2050B6',
  darker: '#153579',
  contrastText: '#FFFFFF',
};

const SECONDARY = {
  lighter: '#EFD6FF',
  light: '#C684FF',
  main: '#8E33FF',
  dark: '#5119B7',
  darker: '#27097A',
  contrastText: '#FFFFFF',
};

const INFO = {
  lighter: '#CAFDF5',
  light: '#61F3F3',
  main: '#00B8D9',
  dark: '#006C9C',
  darker: '#003768',
  contrastText: '#FFFFFF',
};

const SUCCESS = {
  lighter: '#D3FCD2',
  light: '#77ED8B',
  main: '#22C55E',
  dark: '#118D57',
  darker: '#065E49',
  contrastText: '#ffffff',
};

const WARNING = {
  lighter: '#FFF5CC',
  light: '#FFD666',
  main: '#FFAB00',
  dark: '#B76E00',
  darker: '#7A4100',
  contrastText: GREY[800],
};

const ERROR = {
  lighter: '#FFE9D5',
  light: '#FFAC82',
  main: '#FF5630',
  dark: '#B71D18',
  darker: '#7A0916',
  contrastText: '#FFFFFF',
};

function common(primary: typeof PRIMARY_LIGHT_MODE) {
  return {
    common: {
      black: '#000000',
      white: '#FFFFFF',
    },
    primary,
    secondary: SECONDARY,
    info: INFO,
    success: SUCCESS,
    warning: WARNING,
    error: ERROR,
    grey: GREY,
    divider: alpha(GREY[500], 0.2),
    action: {
      hover: alpha(GREY[500], 0.08),
      selected: alpha(GREY[500], 0.16),
      disabled: alpha(GREY[500], 0.8),
      disabledBackground: alpha(GREY[500], 0.24),
      focus: alpha(GREY[500], 0.24),
      hoverOpacity: 0.08,
      disabledOpacity: 0.48,
    },
  };
}

export function palette(mode: 'light' | 'dark') {
  if (mode === 'light') {
    return {
      ...common(PRIMARY_LIGHT_MODE),
      mode: 'light' as const,
      text: {
        primary: GREY[800],
        secondary: GREY[600],
        disabled: GREY[500],
      },
      background: {
        paper: '#FFFFFF',
        default: '#FFFFFF',
        neutral: GREY[200],
      },
      action: {
        ...common(PRIMARY_LIGHT_MODE).action,
        active: GREY[600],
      },
    };
  }

  return {
    ...common(PRIMARY_DARK_MODE),
    mode: 'dark' as const,
    text: {
      primary: '#FFFFFF',
      secondary: GREY[500],
      disabled: GREY[600],
    },
    background: {
      paper: GREY[800],
      default: GREY[900],
      neutral: alpha(GREY[500], 0.12),
    },
    action: {
      ...common(PRIMARY_DARK_MODE).action,
      active: GREY[500],
    },
  };
}
