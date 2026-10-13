/**
 * Glasses page layout on the 576x288 display:
 *
 *   y   8..64   readout text  (full width, receives input: isEventCapture 1)
 *   y  72..216  overlay image (288x144, centered)
 *   y 224..280  status text   (full width)
 *
 * Rules this layout must satisfy (see page-rules.ts and docs/SDK_RESEARCH.md):
 *  - exactly one container has isEventCapture: 1;
 *  - zOrderIndex is all-or-nothing and unique; containers here don't overlap,
 *    so it is omitted everywhere;
 *  - names unique and <= 16 chars; IDs unique; everything inside 576x288.
 */

import type { PageData } from '../sdk/bridge-port.js';
import { CANVAS_W, CANVAS_H, DISPLAY_W, OVERLAY_X, OVERLAY_Y } from './canvas.js';

export const OVERLAY = { id: 1, name: 'overlay' } as const;
export const READOUT = { id: 2, name: 'readout' } as const;
export const STATUS = { id: 3, name: 'status' } as const;

export const MENU_CALIBRATE = 1;
export const MENU_HOLD = 2;
export const MENU_MODE = 3;
export const MENU_EXIT = 4;

const TEXT_X = 8;
const TEXT_W = DISPLAY_W - 16;
const TEXT_H = 56;

export function buildPage(withMenu = true): PageData {
  const page: PageData = {
    containerTotalNum: 3,
    imageObject: [
      {
        containerID: OVERLAY.id,
        containerName: OVERLAY.name,
        xPosition: OVERLAY_X,
        yPosition: OVERLAY_Y,
        width: CANVAS_W,
        height: CANVAS_H,
      },
    ],
    textObject: [
      {
        containerID: READOUT.id,
        containerName: READOUT.name,
        xPosition: TEXT_X,
        yPosition: 8,
        width: TEXT_W,
        height: TEXT_H,
        content: 'LEVEL X',
        textColor: 4,
        // The one input-receiving container. Keep its content to a single line:
        // overflowing capture text makes the firmware scroll it internally.
        isEventCapture: 1,
      },
      {
        containerID: STATUS.id,
        containerName: STATUS.name,
        xPosition: TEXT_X,
        yPosition: OVERLAY_Y + CANVAS_H + 8,
        width: TEXT_W,
        height: TEXT_H,
        content: 'starting...',
        textColor: 2,
        isEventCapture: 0,
      },
    ],
  };
  if (withMenu) {
    page.menuObject = {
      menuItems: [
        { itemName: 'Calibrate', itemID: MENU_CALIBRATE },
        { itemName: 'Hold', itemID: MENU_HOLD },
        { itemName: 'Mode', itemID: MENU_MODE },
        { itemName: 'Exit', itemID: MENU_EXIT },
      ],
    };
  }
  return page;
}
