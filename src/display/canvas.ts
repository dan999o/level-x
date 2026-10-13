/**
 * Display geometry.
 *
 * The G2 shows a 576x288 canvas per eye, origin top-left, 4-bit greyscale
 * (16 green levels). A single image container is limited to 288x144, so the
 * overlay bitmap is 288x144 and is placed centered on the display.
 */
import { IMG_MAX_W, IMG_MAX_H } from './framebuffer.js';

export const DISPLAY_W = 576;
export const DISPLAY_H = 288;

/** Overlay bitmap size (the max image-container size). */
export const CANVAS_W = IMG_MAX_W; // 288
export const CANVAS_H = IMG_MAX_H; // 144
export const CENTER_X = Math.floor(CANVAS_W / 2);
export const CENTER_Y = Math.floor(CANVAS_H / 2);

/** Where the overlay bitmap sits on the display (centered). */
export const OVERLAY_X = (DISPLAY_W - CANVAS_W) / 2; // 144
export const OVERLAY_Y = (DISPLAY_H - CANVAS_H) / 2; // 72

export const DIM = 96;
export const MID = 160;
export const BRIGHT = 255;
