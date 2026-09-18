export const fonts = {
  mono: '"IBM Plex Mono", ui-monospace, monospace',
  sans: '"Sora", "Segoe UI", sans-serif',
  serif: '"Fraunces", Georgia, serif',
} as const;

export type Fonts = typeof fonts;

export default fonts;
