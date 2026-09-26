// ─── Admin theme preset data (Reference-2 / Shadboard full-kit model) ──────
// Mirrors dashboard-refference-2/full-kit/src/configs/themes.ts 1:1.
// The actual CSS variable values live in src/app/themes.css (theme-* classes);
// this file only holds the label + activeColor swatches used by the customizer.

export const radii = [0, 0.3, 0.5, 0.75, 1] as const;

export type ThemeName =
  | "zinc"
  | "slate"
  | "stone"
  | "gray"
  | "neutral"
  | "red"
  | "rose"
  | "orange"
  | "green"
  | "blue"
  | "yellow"
  | "violet";

export type ModeType = "light" | "dark" | "system";
export type LayoutType = "vertical" | "horizontal";

export interface ThemeSwatch {
  light: string;
  dark: string;
  foreground: string;
}

export interface ThemeDef {
  label: string;
  activeColor: ThemeSwatch;
}

export const themes: Record<ThemeName, ThemeDef> = {
  zinc: {
    label: "Zinc",
    activeColor: {
      light: "240 5.9% 10%",
      dark: "240 5.2% 33.9%",
      foreground: "0 0% 98%",
    },
  },
  slate: {
    label: "Slate",
    activeColor: {
      light: "215.4 16.3% 46.9%",
      dark: "215.3 19.3% 34.5%",
      foreground: "210 40% 98%",
    },
  },
  stone: {
    label: "Stone",
    activeColor: {
      light: "25 5.3% 44.7%",
      dark: "33.3 5.5% 32.4%",
      foreground: "60 9.1% 97.8%",
    },
  },
  gray: {
    label: "Gray",
    activeColor: {
      light: "220 8.9% 46.1%",
      dark: "215 13.8% 34.1%",
      foreground: "210 20% 98%",
    },
  },
  neutral: {
    label: "Neutral",
    activeColor: {
      light: "0 0% 45.1%",
      dark: "0 0% 32.2%",
      foreground: "0 0% 98%",
    },
  },
  red: {
    label: "Red",
    activeColor: {
      light: "0 72.2% 50.6%",
      dark: "0 72.2% 50.6%",
      foreground: "0 85.7% 97.3%",
    },
  },
  rose: {
    label: "Rose",
    activeColor: {
      light: "346.8 77.2% 49.8%",
      dark: "346.8 77.2% 49.8%",
      foreground: "355.7 100% 97.3%",
    },
  },
  orange: {
    label: "Orange",
    activeColor: {
      light: "24.6 95% 53.1%",
      dark: "20.5 90.2% 48.2%",
      foreground: "60 9.1% 97.8%",
    },
  },
  green: {
    label: "Green",
    activeColor: {
      light: "142.1 76.2% 36.3%",
      dark: "142.1 70.6% 45.3%",
      foreground: "355.7 100% 97.3%",
    },
  },
  blue: {
    label: "Blue",
    activeColor: {
      light: "221.2 83.2% 53.3%",
      dark: "217.2 91.2% 59.8%",
      foreground: "210 40% 98%",
    },
  },
  yellow: {
    label: "Yellow",
    activeColor: {
      light: "47.9 95.8% 53.1%",
      dark: "47.9 95.8% 53.1%",
      foreground: "26 83.3% 14.1%",
    },
  },
  violet: {
    label: "Violet",
    activeColor: {
      light: "262.1 83.3% 57.8%",
      dark: "263.4 70% 50.4%",
      foreground: "210 20% 98%",
    },
  },
};

export const defaultSettings = {
  theme: "zinc" as ThemeName,
  mode: "light" as ModeType,
  radius: 0.5,
  layout: "vertical" as LayoutType,
};
