import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { Directory, Paths } from 'expo-file-system';
import { isPaperScanAvailable, scanPaperAsync } from '../../modules/stubs-scanner';
import { importFiles, type IncomingFile } from './importer';
import { pickDocument, pickPhotos } from './pickers';
import { setPendingStayFiles } from './stayImport';

/** "+" button flow: choose a source, scan it, open the confirm screen. */
export function useAddTicket() {
  const [busy, setBusy] = useState(false);

  async function run(pick: () => Promise<IncomingFile[]>, asStay = false) {
    const files = await pick();
    if (!files.length) return;
    setBusy(true);
    try {
      await importFiles(files, { asStay });
      router.push('/add');
    } catch (e) {
      Alert.alert("Couldn't add that ticket", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Paper ticket: Apple's document camera, then the usual reading. */
  const paper = () =>
    run(async () => {
      const dir = new Directory(Paths.cache, 'paper');
      dir.create({ intermediates: true, idempotent: true });
      const uris = await scanPaperAsync(dir.uri);
      return uris.map((uri, i) => ({ uri, name: `Paper ticket ${i + 1}.jpg`, mimeType: 'image/jpeg' }));
    });

  const screens = () => run(pickPhotos, true);
  const photos = () => run(pickPhotos);

  /** Pick from a short menu: iOS action sheet, or an alert elsewhere. */
  function menu(title: string, message: string | undefined, options: string[], handle: (choice: string) => void) {
    const all = [...options, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: all, cancelButtonIndex: all.length - 1, title, message }, (i) => i < options.length && handle(options[i]));
    } else {
      Alert.alert(title, message, [...options.map((text) => ({ text, onPress: () => handle(text) })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  }

  /** New stay: screenshots or a PDF, then the New stay screen reads them. */
  async function stayFrom(pick: () => Promise<IncomingFile[]>) {
    const files = await pick();
    if (!files.length) return;
    setPendingStayFiles(files);
    router.push('/new-stay');
  }

  function addStay() {
    menu('Add a stay', 'Screenshots from Airbnb, Booking.com or your host’s messages.', ['Photos', 'PDF from Files'], (c) =>
      stayFrom(c === 'Photos' ? pickPhotos : pickDocument),
    );
  }

  /** The + button: a ticket or a stay. */
  function start() {
    menu('Add', undefined, ['Add ticket', 'Add stay'], (c) => (c === 'Add stay' ? addStay() : open()));
  }

  function open() {
    const ios = Platform.OS === 'ios';
    const options = ['Photos', ...(isPaperScanAvailable ? ['Scan a paper ticket'] : []), 'PDF from Files', 'Cancel'];
    const handle = (i: number) => {
      const choice = options[i];
      if (choice === 'Scan a paper ticket') paper();
      if (choice === 'Photos') run(pickPhotos);
      if (choice === 'PDF from Files') run(pickDocument);
    };
    if (ios) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          title: 'Add a ticket',
          message: 'Tip: in Mail, Safari or a booking app, tap Share → Stash.',
        },
        handle,
      );
    } else {
      Alert.alert('Add a ticket', undefined, [
        ...options.slice(0, -1).map((text, i) => ({ text, onPress: () => handle(i) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  const pdf = () => run(pickDocument);

  return { start, open, addStay, screens, photos, pdf, paper, canScanPaper: isPaperScanAvailable, busy };
}
