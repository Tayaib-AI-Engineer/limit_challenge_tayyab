'use client';

import { Typography } from '@mui/material';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import { pluralize } from '@/lib/format';
import { useDeleteVehicle, useUpdateVehicle } from '@/lib/queries';

type Props = {
  vehicle: { id: number; license_plate: string };
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * Delete, and when the API refuses with 409 because maintenance records still reference
 * the vehicle (they're service history), offer what the user most likely wants instead:
 * deactivating it, which removes it from the active fleet and the service queue.
 */
export function DeleteVehicleDialog({ vehicle, onClose, onDeleted }: Props) {
  const notify = useNotify();
  const remove = useDeleteVehicle(vehicle.id);
  const update = useUpdateVehicle(vehicle.id);
  const [blocking, setBlocking] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (blocking) {
    const reasons = Object.entries(blocking).map(([what, count]) =>
      pluralize(count, what.replace(/s$/, ''), what),
    );
    return (
      <ConfirmDialog
        title={`${vehicle.license_plate} can't be deleted`}
        confirmLabel="Deactivate instead"
        pending={update.isPending}
        error={error}
        onClose={onClose}
        onConfirm={() =>
          update.mutate(
            { active: false },
            {
              onSuccess: () => {
                notify(`${vehicle.license_plate} deactivated.`);
                onClose();
              },
              onError: (caught) => setError(toApiProblem(caught).message),
            },
          )
        }
      >
        <Typography gutterBottom>
          It still has <strong>{reasons.join(', ')}</strong>, which are kept as service history.
        </Typography>
        <Typography>
          Deactivating removes it from the active fleet and the &ldquo;Due for service&rdquo; list,
          and frees its license plate, while keeping its history.
        </Typography>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={`Delete ${vehicle.license_plate}?`}
      confirmLabel="Delete"
      destructive
      pending={remove.isPending}
      error={error}
      onClose={onClose}
      onConfirm={() =>
        remove.mutate(undefined, {
          onSuccess: () => {
            notify(`${vehicle.license_plate} deleted.`);
            onDeleted();
          },
          onError: (caught) => {
            const problem = toApiProblem(caught);
            if (problem.kind === 'conflict') {
              setError(null);
              setBlocking(problem.blocking);
            } else setError(problem.message);
          },
        })
      }
    >
      This permanently removes the vehicle. It can&apos;t be undone.
    </ConfirmDialog>
  );
}
