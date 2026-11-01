import { Directory, File, Paths } from 'expo-file-system';
import { isScannerAvailable, readTicketWithAI, scanFileAsync, type ScannedPage } from '../../modules/stubs-scanner';
import { mergeAI } from './aiReader';
import { dayKey } from './dates';
import { extractDetails, type Extracted, type PageText } from './extract';
import { extractStay, type StayFound } from './stay';
import { deleteStubFiles, newId, stubDir, titleFromFileName } from './files';
import { getState, setDraft } from './store';
import type { Stub, Ticket } from './types';

export type IncomingFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
};

function extensionFor(file: IncomingFile): string {
  const fromName = file.name?.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const mime = file.mimeType ?? '';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic')) return 'heic';
  return 'jpg';
}

/**
 * Copies the incoming files into the app, finds every code on every page,
 * and leaves a draft stub for the confirm screen.
 * Several images (e.g. a screenshot per passenger) become one stub with several tickets.
 */
export type ImportOptions = {
  /** Fail instead of keeping the page when no code is found (e.g. a web capture). */
  requireCode?: boolean;
  /** Added from the Stays tab: read it as check-in details whatever it looks like. */
  asStay?: boolean;
};

export async function importFiles(files: IncomingFile[], options: ImportOptions = {}): Promise<Stub> {
  if (!files.length) throw new Error('Nothing to import.');
  const id = newId();
  try {
    return await buildDraft(id, files, options);
  } catch (e) {
    deleteStubFiles(id);
    throw e;
  }
}

async function buildDraft(id: string, files: IncomingFile[], options: ImportOptions): Promise<Stub> {
  const dir = stubDir(id);

  const tickets: Ticket[] = [];
  const pageUris: string[] = [];
  const pageTexts: PageText[] = [];
  let sourceUri = '';

  for (const [i, incoming] of files.entries()) {
    const src = new File(incoming.uri);
    const dest = new File(dir, `source-${i}.${extensionFor(incoming)}`);
    await src.copy(dest);
    if (!sourceUri) sourceUri = dest.uri;

    let pages: ScannedPage[] = [];
    if (isScannerAvailable) {
      pages = await scanFileAsync(dest.uri, dir.uri);
    } else if (!/pdf/i.test(dest.extension)) {
      // Expo Go fallback: keep the image, no code detection.
      pages = [{ pageIndex: 0, imageUri: dest.uri, width: 0, height: 0, codes: [], text: '' }];
    }

    const anyCodes = pages.some((p) => p.codes.length > 0);
    for (const page of pages) {
      pageUris.push(page.imageUri);
      const before = tickets.length;
      if (page.codes.length) {
        // A page with a QR (or other square code) and a barcode is one ticket: keep the square code.
        const square = page.codes.filter((c) => c.symbology !== 'linear');
        const seen = new Set<string>();
        const codes = (square.length ? square : page.codes).filter((c) => {
          if (!c.payload) return true;
          if (seen.has(c.payload)) return false;
          seen.add(c.payload);
          return true;
        });
        for (const code of codes) {
          tickets.push({ id: newId(), pageUri: page.imageUri, code });
        }
      } else if (!anyCodes && page === pages[0]) {
        // No code anywhere in this file (e.g. a booking confirmation): the whole file is one
        // ticket, shown from its first page; every page is still there in the original.
        tickets.push({ id: newId(), pageUri: page.imageUri });
      }
      pageTexts.push({
        text: page.text ?? '',
        codes: tickets.length - before,
        payloads: tickets.slice(before).map((t) => t.code?.payload),
      });
    }
  }

  if (options.requireCode && isScannerAvailable && !tickets.some((t) => t.code)) {
    throw new Error('No ticket code on screen. Scroll until the QR code or barcode is fully visible, then capture again.');
  }

  if (!tickets.length) {
    throw new Error("Couldn't read that file. Try a screenshot of the ticket instead.");
  }

  // Read date, time, seats, gates and refs off the ticket text.
  const found = await readDetails(pageTexts, tickets.length);
  let stayFound: Stub['stay'];
  tickets.forEach((t, i) => {
    if (found.perTicket[i]?.length) t.details = found.perTicket[i];
  });
  const fileTitle = titleFromFileName(files[0].name);
  // Airbnb / hotel screenshots: read check-in details instead of seats and gates.
  if (options.asStay) found.kind = 'stay';
  if (found.kind === 'stay') {
    const st = extractStay(pageTexts.map((p) => p.text).join('\n'));
    found.date = st.date ?? found.date;
    // A ticket-style time (e.g. cleaners 11:00–15:00) is often wrong for a stay: only use check-in.
    found.time = st.time;
    found.title = st.title ?? found.title;
    found.shared = found.shared.filter((d) => d.label === 'Ref');
    found.perTicket = found.perTicket.map(() => []);
    stayFound = st.stay;
  }
  const autofill: Stub['autofill'] = [];
  if (found.date) autofill.push('date');
  if (found.time) autofill.push('time');
  if (found.kind) autofill.push('kind');
  if (found.title) autofill.push('title');

  const draft: Stub = {
    id,
    // What the ticket says beats the file name ("E-ticket_48812.pdf").
    title: found.title || fileTitle || '',
    kind: found.kind ?? 'event',
    date: found.date ?? dayKey(),
    time: found.time,
    details: found.shared.length ? found.shared : undefined,
    stay: stayFound,
    autofill,
    tickets,
    sourceUri,
    sourceName: files[0].name ?? 'Ticket',
    pageUris,
    createdAt: Date.now(),
  };
  setDraft(draft);
  return draft;
}

/**
 * Reads an already-saved ticket again (e.g. one saved before Stash could read details)
 * and returns what it found. Uses the stored page images, so it works offline.
 */
export async function rereadStub(stub: Stub): Promise<Extracted & { stayFound?: StayFound }> {
  // A pasted stay has no pages: read its saved text again.
  if (stub.kind === 'stay' && !stub.tickets.some((t) => t.pageUri)) {
    const text = stub.stay?.notes ?? '';
    return { shared: [], perTicket: [], stayFound: extractStay(text) };
  }
  const pages = await readPages(stub);
  const found = await readDetails(pages, stub.tickets.length);
  if (stub.kind !== 'stay' && found.kind !== 'stay') return found;
  const stayFound = extractStay(pages.map((p) => p.text).join('\n'));
  return { ...found, stayFound, time: stayFound.time ?? found.time, title: stayFound.title ?? found.title };
}

/**
 * Stash's own reader, then Apple Intelligence (on the phone, iOS 26+) to fill gaps and tidy the
 * title. Only answers that are printed on the ticket are used. Off if the person turned it off.
 */
async function readDetails(pages: PageText[], ticketCount: number): Promise<Extracted> {
  const found = extractDetails(pages, ticketCount);
  if (getState().settings.smartReading === false) return found;
  const text = pages.map((p) => p.text).join('\n');
  const ai = await readTicketWithAI(text, dayKey());
  const { fromAI: _fromAI, ...merged } = mergeAI(found, ai, text, ticketCount);
  return merged;
}

/** The text Stash reads off each saved page (for "Send what Stash read" in the ticket menu). */
export async function readStubText(stub: Stub): Promise<string> {
  const pages = await readPages(stub);
  return pages.map((p, i) => `--- page ${i + 1} (${p.codes} code${p.codes === 1 ? '' : 's'}) ---\n${p.text || '(no text found)'}`).join('\n\n');
}

async function readPages(stub: Stub): Promise<PageText[]> {
  if (!isScannerAvailable) throw new Error('Reading tickets needs the full app, not Expo Go.');
  const scratch = new Directory(Paths.cache, `reread-${stub.id}`);
  try {
    if (scratch.exists) scratch.delete();
  } catch {}
  scratch.create({ intermediates: true, idempotent: true });

  // Tickets in order, grouped by the page they came from.
  const order: string[] = [];
  const byPage = new Map<string, Ticket[]>();
  for (const t of stub.tickets) {
    if (!byPage.has(t.pageUri)) {
      byPage.set(t.pageUri, []);
      order.push(t.pageUri);
    }
    byPage.get(t.pageUri)!.push(t);
  }

  const pages: PageText[] = [];
  for (const uri of order) {
    const tickets = byPage.get(uri)!;
    let text = '';
    try {
      const scanned = await scanFileAsync(uri, scratch.uri);
      text = scanned.map((p) => p.text ?? '').join('\n');
    } catch {
      // Page image missing: carry on with the barcode contents we have.
    }
    pages.push({ text, codes: tickets.length, payloads: tickets.map((t) => t.code?.payload) });
  }
  try {
    scratch.delete();
  } catch {}
  return pages;
}

/** Check-in details pasted as text (a host message, an email): a stay with no files. */
export function importText(text: string): Stub {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste the check-in details first.');
  const st = extractStay(trimmed);
  const ref = extractDetails([{ text: trimmed, codes: 0 }], 0).shared.filter((d) => d.label === 'Ref');
  const autofill: Stub['autofill'] = ['kind'];
  if (st.date) autofill.push('date');
  if (st.time) autofill.push('time');
  if (st.title) autofill.push('title');
  const draft: Stub = {
    id: newId(),
    title: st.title ?? '',
    kind: 'stay',
    date: st.date ?? dayKey(),
    time: st.time,
    details: ref.length ? ref : undefined,
    stay: { ...st.stay, notes: trimmed.slice(0, 4000) },
    autofill,
    tickets: [],
    sourceUri: '',
    sourceName: 'Pasted text',
    pageUris: [],
    createdAt: Date.now(),
  };
  setDraft(draft);
  return draft;
}
