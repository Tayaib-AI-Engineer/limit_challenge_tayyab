'use client';

import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useState, type FormEvent } from 'react';

import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import { useToday } from '@/lib/hooks';
import { useCreateMaintenanceRecord, useMechanics } from '@/lib/queries';
import { MAINTENANCE_TYPES, type MaintenanceType, type Mechanic } from '@/lib/types';

type Props = {
  vehicle: { id: number; license_plate: string };
  onClose: () => void;
};

const COST_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Record a service. Mounted only while open, so every opening starts from a clean form. */
export function LogServiceDialog({ vehicle, onClose }: Props) {
  const today = useToday();
  const notify = useNotify();
  const mechanics = useMechanics();
  const create = useCreateMaintenanceRecord();

  const [date, setDate] = useState(today);
  const [type, setType] = useState<MaintenanceType>('oil_change');
  const [mechanic, setMechanic] = useState<Mechanic | null>(null);
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The API rejects inactive mechanics on new records, so they aren't offered.
  const activeMechanics = (mechanics.data ?? []).filter((m) => m.active);

  const clientErrors: Record<string, string> = {};
  if (!date) clientErrors.date = 'Pick the service date.';
  else if (date > today) clientErrors.date = "Can't be in the future.";
  if (!mechanic) clientErrors.mechanic = 'Pick the mechanic who did the work.';
  if (!COST_PATTERN.test(cost.trim())) clientErrors.cost = 'A positive amount, e.g. 89.90.';
  const errors = { ...(submitted ? clientErrors : {}), ...serverErrors };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setServerErrors({});
    setFormError(null);
    if (Object.keys(clientErrors).length || !mechanic) return;
    create.mutate(
      {
        vehicle: vehicle.id,
        mechanic: mechanic.id,
        date,
        maintenance_type: type,
        cost: cost.trim(),
        notes: notes.trim(),
      },
      {
        onSuccess: () => {
          notify(`${MAINTENANCE_TYPES[type]} logged for ${vehicle.license_plate}.`);
          onClose();
        },
        onError: (error) => {
          const problem = toApiProblem(error);
          if (problem.kind === 'validation') setServerErrors(problem.fields);
          setFormError(problem.message);
        },
      },
    );
  }

  return (
    <Dialog open onClose={create.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>Log service for {vehicle.license_plate}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                type="date"
                label="Date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                error={!!errors.date}
                helperText={errors.date}
                required
                fullWidth
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
              />
              <TextField
                select
                label="Type"
                value={type}
                onChange={(event) => setType(event.target.value as MaintenanceType)}
                error={!!errors.maintenance_type}
                helperText={errors.maintenance_type}
                fullWidth
              >
                {Object.entries(MAINTENANCE_TYPES).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Autocomplete
              options={activeMechanics}
              loading={mechanics.isPending}
              value={mechanic}
              onChange={(_, value) => setMechanic(value)}
              getOptionLabel={(m) => `${m.name} · ${m.certification_number}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Mechanic"
                  required
                  error={!!errors.mechanic}
                  helperText={errors.mechanic ?? 'Only active mechanics can be assigned.'}
                />
              )}
            />
            <TextField
              label="Cost"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              error={!!errors.cost}
              helperText={errors.cost ?? '0 is allowed, e.g. for warranty work.'}
              required
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                htmlInput: { inputMode: 'decimal' },
              }}
            />
            <TextField
              label="Notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              error={!!errors.notes}
              helperText={errors.notes}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={create.isPending}>
            Log service
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
