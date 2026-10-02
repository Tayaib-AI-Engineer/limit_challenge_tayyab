'use client';

import { TextField, type TextFieldProps } from '@mui/material';
import { useState } from 'react';

type Props = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

/**
 * A text filter that applies on Enter or when the field loses focus, not on every
 * keystroke. Make and model are exact matches, so searching while typing would flash
 * "no results" for every partial word ("Fo", "For", ...).
 */
export function CommitTextField({ value, onCommit, ...props }: Props) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // Follow outside changes (a removed chip, "Clear all", Back) without an effect.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  return (
    <TextField
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}
