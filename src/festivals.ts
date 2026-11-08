import type { LaunchOpts, Scene, ShellType } from './engine/engine';
import { COLORS, type RGB } from './engine/utils';

export type IconName = 'coin' | 'diya' | 'burst' | 'hill' | 'heart' | 'sunrise';

export interface Festival {
  id: string;
  day: number;
  name: string;
  /** shown under the name, e.g. the alternative name of the day */
  sub?: string;
  /** local calendar date this festival falls on (YYYY-MM-DD). The highlighted day changes at local midnight. */
  date: string;
  heading: string;
  wish: string;
  icon: IconName;
  /** CSS accent colour for the UI */
  accent: string;
  /** secondary CSS colour for gradients */
  accent2: string;
  show: {
    combos: [RGB, RGB][];
    shells: { v: ShellType; w: number }[];
    signature: Partial<LaunchOpts> & { type: ShellType };
    /** 1 = gentle, 2 = lively, 3 = the grandest show */
    intensity: 1 | 2 | 3;
    /** seconds between background shells while the greeting is on screen */
    greetEvery: [number, number];
    scene: Scene;
  };
}

const PINK: RGB = [255, 105, 170];
const ROSE: RGB = [255, 160, 200];
const GREEN: RGB = [110, 230, 120];
const EMERALD: RGB = [60, 210, 150];
const LIME: RGB = [210, 255, 150];
const RED: RGB = [255, 70, 60];
const VIOLET: RGB = [170, 130, 255];
const BLUE: RGB = [110, 170, 255];
const MAGENTA: RGB = [255, 80, 200];

/**
 * Diwali 2026 dates (India). Update these each year — everything else follows automatically.
 * Days that fall between two festivals (e.g. 9 Nov) keep showing the most recent one.
 */
export const FESTIVALS: Festival[] = [
  {
    id: 'dhanteras', day: 1, name: 'Dhanteras', date: '2026-11-06', icon: 'coin',
    heading: 'May Prosperity Find Its Way to You.',
    wish: 'Wishing you new beginnings, endless opportunities, and a future filled with abundance. Happy Dhanteras!',
    accent: '#FFC94D', accent2: '#FF9A1F',
    show: {
      combos: [[COLORS.gold, COLORS.pale], [COLORS.pale, COLORS.white], [COLORS.gold, COLORS.amber], [COLORS.white, COLORS.gold]],
      shells: [{ v: 'peony', w: 3 }, { v: 'willow', w: 3 }, { v: 'chrysanthemum', w: 2 }, { v: 'palm', w: 1.5 }, { v: 'crackle', w: 1 }],
      signature: { type: 'peony', main: COLORS.gold, alt: COLORS.pale, coins: 34, scale: 1.2, big: true },
      intensity: 2, greetEvery: [1.1, 1.8],
      scene: { tint: [255, 180, 60], tintA: 1, diyas: 1, lanterns: 0, hearts: 0, coins: 0.9 },
    },
  },
  {
    id: 'choti-diwali', day: 2, name: 'Choti Diwali', sub: 'Naraka Chaturdashi', date: '2026-11-07', icon: 'diya',
    heading: 'A Little Light. A Lot of Happiness.',
    wish: 'May every spark bring joy, every light bring hope, and every moment bring something beautiful. Happy Choti Diwali!',
    accent: '#FF8A2A', accent2: '#FFC94D',
    show: {
      combos: [[COLORS.orange, COLORS.gold], [COLORS.amber, COLORS.pale], [COLORS.gold, COLORS.orange], [COLORS.ember, COLORS.gold]],
      shells: [{ v: 'crackle', w: 3 }, { v: 'chrysanthemum', w: 3 }, { v: 'peony', w: 2 }, { v: 'strobe', w: 1.5 }, { v: 'willow', w: 1 }],
      signature: { type: 'chrysanthemum', main: COLORS.orange, alt: COLORS.gold, scale: 1.25, big: true },
      intensity: 2, greetEvery: [1.0, 1.7],
      scene: { tint: [255, 120, 30], tintA: 1, diyas: 1, lanterns: 0, hearts: 0, coins: 0 },
    },
  },
  {
    id: 'diwali', day: 3, name: 'Diwali', sub: 'Lakshmi Puja', date: '2026-11-08', icon: 'burst',
    heading: "Here's to Brighter Beginnings.",
    wish: 'May your world shine with happiness, your dreams glow brighter, and your celebrations be unforgettable. Happy Diwali!',
    accent: '#FFD27A', accent2: '#FF6A00',
    show: {
      combos: [
        [COLORS.gold, COLORS.white], [COLORS.orange, COLORS.gold], [RED, COLORS.gold], [MAGENTA, COLORS.white],
        [GREEN, COLORS.gold], [BLUE, COLORS.white], [VIOLET, COLORS.pale], [COLORS.white, COLORS.orange],
      ],
      shells: [
        { v: 'peony', w: 3 }, { v: 'chrysanthemum', w: 3 }, { v: 'willow', w: 2 }, { v: 'ring', w: 1.5 },
        { v: 'palm', w: 1.5 }, { v: 'strobe', w: 1.2 }, { v: 'crackle', w: 1.5 },
      ],
      signature: { type: 'ring', main: COLORS.gold, alt: MAGENTA, scale: 1.3, big: true },
      intensity: 3, greetEvery: [0.4, 0.8],
      scene: { tint: [255, 150, 80], tintA: 1.2, diyas: 1, lanterns: 0.25, hearts: 0, coins: 0 },
    },
  },
  {
    id: 'govardhan-puja', day: 4, name: 'Govardhan Puja', date: '2026-11-10', icon: 'hill',
    heading: 'Growing Together. Glowing Together.',
    wish: 'May this day bring gratitude, togetherness, strength, and countless reasons to celebrate. Happy Govardhan Puja!',
    accent: '#8BE38F', accent2: '#FFC94D',
    show: {
      combos: [[GREEN, COLORS.gold], [EMERALD, COLORS.pale], [COLORS.gold, GREEN], [LIME, COLORS.white]],
      shells: [{ v: 'willow', w: 3 }, { v: 'peony', w: 2.5 }, { v: 'ring', w: 1 }, { v: 'chrysanthemum', w: 1.5 }],
      signature: { type: 'willow', main: GREEN, alt: COLORS.gold, scale: 1.25 },
      intensity: 1, greetEvery: [1.6, 2.6],
      scene: { tint: [70, 200, 120], tintA: 0.9, diyas: 0.6, lanterns: 0.9, hearts: 0, coins: 0 },
    },
  },
  {
    id: 'bhai-dooj', day: 5, name: 'Bhai Dooj', date: '2026-11-11', icon: 'heart',
    heading: 'Some Bonds Shine Forever.',
    wish: 'Celebrating the laughter, memories, and beautiful bonds that make life brighter. Happy Bhai Dooj!',
    accent: '#FF85B8', accent2: '#FFB04D',
    show: {
      combos: [[PINK, COLORS.gold], [ROSE, COLORS.white], [COLORS.orange, PINK], [COLORS.gold, ROSE]],
      shells: [{ v: 'heart', w: 2 }, { v: 'peony', w: 3 }, { v: 'willow', w: 1.5 }, { v: 'chrysanthemum', w: 2 }, { v: 'ring', w: 1 }],
      signature: { type: 'heart', main: PINK, alt: COLORS.gold, scale: 1.3, big: true },
      intensity: 2, greetEvery: [1.1, 1.8],
      scene: { tint: [255, 100, 160], tintA: 0.9, diyas: 0.5, lanterns: 0, hearts: 1, coins: 0 },
    },
  },
  {
    id: 'labh-panchami', day: 6, name: 'Labh Panchami', date: '2026-11-14', icon: 'sunrise',
    heading: 'New Beginnings. Limitless Possibilities.',
    wish: "Here's to fresh opportunities, meaningful growth, and success in everything you create. Happy Labh Panchami!",
    accent: '#FF9A3C', accent2: '#FFD27A',
    show: {
      combos: [[COLORS.orange, COLORS.gold], [COLORS.gold, COLORS.white], [COLORS.white, COLORS.orange], [COLORS.amber, COLORS.pale]],
      shells: [{ v: 'palm', w: 2.5 }, { v: 'strobe', w: 2 }, { v: 'chrysanthemum', w: 2.5 }, { v: 'peony', w: 2 }, { v: 'crackle', w: 1.5 }, { v: 'willow', w: 1.5 }],
      signature: { type: 'palm', main: COLORS.gold, alt: COLORS.orange, scale: 1.3, big: true, coins: 18 },
      intensity: 3, greetEvery: [0.6, 1.1],
      scene: { tint: [255, 130, 40], tintA: 1.1, diyas: 0.8, lanterns: 0.6, hearts: 0, coins: 0.4 },
    },
  },
];

export const MENU_SCENE: Scene = { tint: [255, 110, 30], tintA: 0.6, diyas: 1, lanterns: 0.15, hearts: 0, coins: 0 };
export const FINALE_SCENE: Scene = { tint: [255, 130, 40], tintA: 1.3, diyas: 1, lanterns: 0.5, hearts: 0, coins: 0.3 };

export const FINALE_COMBOS: [RGB, RGB][] = [
  [COLORS.orange, COLORS.gold], [COLORS.gold, COLORS.white], [COLORS.white, COLORS.orange],
  [COLORS.amber, COLORS.pale], [COLORS.pale, COLORS.gold],
];

/** The family name spelled out by the firework sparks, with FAMILY_WORD forming underneath. */
export const FAMILY_NAME = 'NIKHARGE';
export const FAMILY_WORD = 'FAMILY';
/** How the name reads in sentences and signatures. */
export const FAMILY = 'Nikharge Family';

export const BRAND_LINE = 'From all of us in the Nikharge family, wishing you a celebration filled with light and happiness.';
export const FINALE_TITLE = ['Six Days of Light.', 'A Lifetime of Possibilities.'];
export const FINALE_WISH = 'From the Nikharge family to yours, wishing you a Diwali filled with joy, prosperity, and beautiful new beginnings.';
export const TAGLINE = 'Creating Brighter Tomorrows.';
