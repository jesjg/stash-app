// Getting a new stay's screenshots or PDF into the app: copy them in, then read each page.
import { File } from 'expo-file-system';
import { isScannerAvailable, scanFileAsync } from '../../modules/stubs-scanner';
import { stubDir } from './files';
import { extensionFor, type IncomingFile } from './importer';

export type StayPage = { imageUri: string; text: string; label: string };

// The + menu picks the files, then opens the New stay screen, which takes them from here.
let pending: IncomingFile[] = [];
export function setPendingStayFiles(files: IncomingFile[]) {
  pending = files;
}
export function takePendingStayFiles(): IncomingFile[] {
  const files = pending;
  pending = [];
  return files;
}

/** Copies the files into the stay's folder and returns every page with its text. */
export async function scanStayFile(id: string, file: IncomingFile, n: number): Promise<StayPage[]> {
  const dir = stubDir(id);
  const dest = new File(dir, `source-${n}-${Date.now()}.${extensionFor(file)}`);
  await new File(file.uri).copy(dest);
  const pdf = /pdf/i.test(dest.extension) || /pdf/i.test(file.mimeType ?? '');
  if (!isScannerAvailable) {
    return pdf ? [] : [{ imageUri: dest.uri, text: '', label: 'Screenshot' }];
  }
  const pages = await scanFileAsync(dest.uri, dir.uri);
  return pages.map((p, i) => ({ imageUri: p.imageUri, text: p.text ?? '', label: pdf ? `Page ${i + 1}` : 'Screenshot' }));
}
