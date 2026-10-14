// Breakpoints MUI alinhados aos valores em pixel que o Tailwind já usa por
// omissão (sm/md/lg/xl), para que media queries MUI e Tailwind concordem.
// O Tailwind tem ainda um "2xl" (1536px) sem equivalente direto no MUI
// (que só tem 5 níveis) — fica de fora, sem impacto prático até hoje.

export const breakpoints = {
  values: {
    xs: 0,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
};
