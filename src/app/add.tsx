import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StubForm } from '../components/StubForm';
import { showToast } from '../components/Toast';
import { discardDraft, isPast, saveDraft, useStore } from '../lib/store';

function leave() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

/** Confirm screen after a ticket has been scanned in. */
export default function Add() {
  const draft = useStore((s) => s.draft);
  const leaving = useRef(false);

  useEffect(() => {
    if (!draft && !leaving.current) {
      leaving.current = true;
      leave();
    }
  }, [draft]);

  if (!draft) return null;

  return (
    <StubForm
      heading={draft.kind === 'stay' ? 'New stay' : 'New ticket'}
      stub={draft}
      saveLabel={draft.kind === 'stay' ? 'Save stay' : draft.tickets.length > 1 ? `Save ${draft.tickets.length} tickets` : 'Save ticket'}
      onCancel={() => {
        leaving.current = true;
        discardDraft();
        leave();
      }}
      onSave={async (fields) => {
        leaving.current = true;
        const saved = await saveDraft(fields);
        leave();
        if (saved) {
          // Land on the tab it lives in.
          router.navigate('/');
          showToast(
            isPast(saved)
              ? 'Saved under Past: that date has passed.'
              : saved.kind === 'stay'
                ? saved.reminderId
                  ? 'Stay saved. Reminder set for check-in.'
                  : 'Stay saved.'
                : saved.reminderId
                  ? 'Saved. Reminder set.'
                  : 'Saved.',
          );
        }
      }}
    />
  );
}
