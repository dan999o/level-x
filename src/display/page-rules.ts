/**
 * Page validation: the SDK's own validator plus the documented host rules it
 * does not check (Even Hub docs "Display & UI System"). Used before every
 * create/rebuild in the app and by the MockBridge, so a layout that the glasses
 * would reject also fails in tests.
 */

import {
  validateEvenHubPageContainer,
  formatEvenHubPageContainerValidationError,
} from '@evenrealities/even_hub_sdk';
import type { PageData } from '../sdk/bridge-port.js';
import { DISPLAY_W, DISPLAY_H } from './canvas.js';
import { IMG_MIN_W, IMG_MAX_W, IMG_MIN_H, IMG_MAX_H } from './framebuffer.js';

const MAX_NAME_LEN = 16;
const MAX_IMAGE = 4;
const MAX_OTHER = 8;
const MAX_CREATE_TEXT = 1000;

/** Returns null when valid, otherwise a human-readable reason. */
export function validatePage(page: PageData): string | null {
  const sdk = validateEvenHubPageContainer(page as never);
  if (!sdk.valid) return formatEvenHubPageContainerValidationError(sdk);

  const texts = page.textObject ?? [];
  const images = page.imageObject ?? [];
  const all = [...texts, ...images];

  if (images.length > MAX_IMAGE) return `too many image containers (${images.length} > ${MAX_IMAGE})`;
  if (texts.length > MAX_OTHER) return `too many text containers (${texts.length} > ${MAX_OTHER})`;
  if (page.containerTotalNum !== all.length) {
    return `containerTotalNum ${page.containerTotalNum} does not match ${all.length} declared containers`;
  }

  const capture = texts.filter((t) => t.isEventCapture === 1);
  if (capture.length !== 1) {
    return `exactly one container must have isEventCapture: 1 (found ${capture.length})`;
  }

  const ids = new Set<number>();
  const names = new Set<string>();
  for (const c of all) {
    if (ids.has(c.containerID)) return `duplicate containerID ${c.containerID}`;
    ids.add(c.containerID);
    if (names.has(c.containerName)) return `duplicate containerName "${c.containerName}"`;
    names.add(c.containerName);
    if (c.containerName.length > MAX_NAME_LEN) {
      return `containerName "${c.containerName}" exceeds ${MAX_NAME_LEN} characters`;
    }
    if (c.xPosition < 0 || c.yPosition < 0 || c.xPosition + c.width > DISPLAY_W || c.yPosition + c.height > DISPLAY_H) {
      return `container "${c.containerName}" lies outside the ${DISPLAY_W}x${DISPLAY_H} display`;
    }
  }

  for (const i of images) {
    if (i.width < IMG_MIN_W || i.width > IMG_MAX_W || i.height < IMG_MIN_H || i.height > IMG_MAX_H) {
      return `image "${i.containerName}" is ${i.width}x${i.height}; allowed ${IMG_MIN_W}-${IMG_MAX_W} x ${IMG_MIN_H}-${IMG_MAX_H}`;
    }
  }
  for (const t of texts) {
    if ((t.content?.length ?? 0) > MAX_CREATE_TEXT) {
      return `text "${t.containerName}" exceeds ${MAX_CREATE_TEXT} characters`;
    }
  }
  return null;
}
