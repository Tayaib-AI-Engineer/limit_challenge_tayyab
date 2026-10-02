'use client';

import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import { useAssignOffice, useOffices } from '@/lib/queries';
import type { Office } from '@/lib/types';

type Props = {
  vehicle: { id: number; license_plate: string; office: Office };
  onClose: () => void;
};

/** Uses the dedicated assign-office endpoint: the only way to change a vehicle's office. */
export function MoveOfficeDialog({ vehicle, onClose }: Props) {
  const notify = useNotify();
  const offices = useOffices().data ?? [];
  const assign = useAssignOffice(vehicle.id);
  const [officeId, setOfficeId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const target = offices.find((office) => office.id === officeId);

  return (
    <ConfirmDialog
      title={`Move ${vehicle.license_plate}`}
      confirmLabel="Move vehicle"
      pending={assign.isPending}
      error={error}
      onClose={onClose}
      onConfirm={() => {
        if (!target) {
          setError('Pick the office to move the vehicle to.');
          return;
        }
        setError(null);
        assign.mutate(target.id, {
          onSuccess: () => {
            notify(`${vehicle.license_plate} moved to ${target.name}.`);
            onClose();
          },
          onError: (caught) => setError(toApiProblem(caught).message),
        });
      }}
    >
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>
          Currently at <strong>{vehicle.office.name}</strong>.
        </Typography>
        <TextField
          select
          label="New office"
          value={officeId}
          onChange={(event) => setOfficeId(Number(event.target.value))}
          fullWidth
        >
          {offices
            .filter((office) => office.id !== vehicle.office.id)
            .map((office) => (
              <MenuItem key={office.id} value={office.id}>
                {office.name}
              </MenuItem>
            ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          No assignment history is kept: the vehicle&apos;s past maintenance costs will count
          towards its new office in the office summary.
        </Typography>
      </Stack>
    </ConfirmDialog>
  );
}
