import { requireOptionalNativeModule } from 'expo';

export type ScannedCode = {
  /** qr | aztec | pdf417 | datamatrix | linear */
  symbology: string;
  /** Decoded text, when the code holds text. */
  payload?: string;
  /** PNG crop of the code with a quiet zone, straight from the ticket. */
  cropUri: string;
};

export type ScannedPage = {
  pageIndex: number;
  /** The page's text: the PDF text layer, or on-device OCR for images and scans. */
  text: string;
  imageUri: string;
  width: number;
  height: number;
  codes: ScannedCode[];
};

/** What Apple's on-device model read off a ticket. Every field may be empty. */
export type AIRead = {
  kind?: string;
  title?: string;
  company?: string;
  date?: string;
  time?: string;
  details?: { label: string; value: string }[];
};

type NativeScanner = {
  scanFileAsync(uri: string, outDir: string): Promise<ScannedPage[]>;
  /** Newer builds only: Apple's document camera for paper tickets. */
  scanPaperAsync?(outDir: string): Promise<string[]>;
  /** 1.1 builds and later: Apple Intelligence, on the phone. */
  aiStatus?(): string;
  readTicketAsync?(text: string, today: string): Promise<AIRead & { error?: string }>;
};

// Optional so the JS still loads in Expo Go; scanning needs a development build.
const native = requireOptionalNativeModule<NativeScanner>('StubsScanner');

export const isScannerAvailable = native != null;

export async function scanFileAsync(uri: string, outDir: string): Promise<ScannedPage[]> {
  if (!native) {
    throw new Error('Ticket scanning needs a development build (it does not run in Expo Go).');
  }
  return native.scanFileAsync(uri, outDir);
}

/** True on builds that include the paper-ticket camera. */
export const isPaperScanAvailable = typeof native?.scanPaperAsync === 'function';

/** Opens the document camera; resolves with the scanned page image URIs ([] if cancelled). */
export async function scanPaperAsync(outDir: string): Promise<string[]> {
  if (!native?.scanPaperAsync) throw new Error('Scanning paper tickets needs the latest Stash from TestFlight.');
  return native.scanPaperAsync(outDir);
}

/**
 * Apple Intelligence on this iPhone: 'available', 'notEnabled' (turned off in Settings),
 * 'notReady' (still downloading), 'notEligible' (older iPhone) or 'unsupported' (older iOS or build).
 */
export function aiStatus(): string {
  try {
    return native?.aiStatus?.() ?? 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** Reads ticket text with Apple's on-device model. null when it isn't available or fails. */
export async function readTicketWithAI(text: string, today: string): Promise<AIRead | null> {
  if (!native?.readTicketAsync || aiStatus() !== 'available' || !text.trim()) return null;
  try {
    // Never keep the person waiting: after a while, carry on with what Stash read itself.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_TIMEOUT_MS));
    const r = await Promise.race([native.readTicketAsync(text, today), timeout]);
    return r && !r.error ? r : null;
  } catch {
    return null;
  }
}

/** How long to wait for Apple Intelligence before going without it. */
const AI_TIMEOUT_MS = 6000;
