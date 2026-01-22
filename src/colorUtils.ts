/**
 * Color utility functions for icon theme generation
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Convert hex color to RGB (0-1 range)
 */
export function hexToRgb(hex: string): RGB {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

/**
 * Convert RGB (0-1 range) to hex color
 */
export function rgbToHex(rgb: RGB): string {
  const r = Math.floor(Math.max(0, Math.min(1, rgb.r)) * 255);
  const g = Math.floor(Math.max(0, Math.min(1, rgb.g)) * 255);
  const b = Math.floor(Math.max(0, Math.min(1, rgb.b)) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === rgb.r) {
      h = (rgb.g - rgb.b) / d + (rgb.g < rgb.b ? 6 : 0);
    } else if (max === rgb.g) {
      h = (rgb.b - rgb.r) / d + 2;
    } else {
      h = (rgb.r - rgb.g) / d + 4;
    }
    h = h / 6;
  }

  return { h, s, l };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hueToRgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  return { r, g, b };
}

/**
 * Adjust lightness of a color
 * @param hex - The hex color
 * @param amount - Amount to adjust (-1 to 1)
 */
export function adjustLightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, Math.min(1, hsl.l + amount));
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Adjust saturation of a color
 * @param hex - The hex color
 * @param amount - Amount to adjust (-1 to 1)
 */
export function adjustSaturation(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  hsl.s = Math.max(0, Math.min(1, hsl.s + amount));
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Validate if a string is a valid hex color
 */
export function isValidHex(hex: string): boolean {
  return /^#?[0-9A-Fa-f]{6}$/.test(hex);
}

/**
 * Normalize hex color (ensure it starts with #)
 */
export function normalizeHex(hex: string): string {
  if (!hex.startsWith('#')) {
    hex = '#' + hex;
  }
  return hex.toLowerCase();
}
