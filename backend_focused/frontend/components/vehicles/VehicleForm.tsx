'use client';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Link as MuiLink,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import { useBackToVehiclesHref, useDebouncedValue, useToday } from '@/lib/hooks';
import { useCreateVehicle, useDuplicateCheck, useOffices, useUpdateVehicle } from '@/lib/queries';
import {
  FIRST_VIN_MODEL_YEAR,
  latestModelYear,
  licensePlateError,
  normalizeIdentifier,
  vinError,
  yearError,
} from '@/lib/rules';
import type { VehicleDetail, VehicleInput } from '@/lib/types';

type Values = {
  vin: string;
  license_plate: string;
  make: string;
  model: string;
  year: string;
  office: number | '';
  active: boolean;
};

type Field = keyof Values;

const EMPTY: Values = {
  vin: '',
  license_plate: '',
  make: '',
  model: '',
  year: '',
  office: '',
  active: true,
};

function valuesOf(vehicle: VehicleDetail): Values {
  return {
    vin: vehicle.vin,
    license_plate: vehicle.license_plate,
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    office: vehicle.office.id,
    active: vehicle.active,
  };
}

const identifierSx = {
  '& input': { fontFamily: 'var(--font-geist-mono), monospace', letterSpacing: 0.5 },
};

type Props = { vehicle?: VehicleDetail };

/** Create (no `vehicle`) or edit. The server stays the authority; these checks are hints. */
export function VehicleForm({ vehicle }: Props) {
  const editing = !!vehicle;
  const initial = useMemo(() => (vehicle ? valuesOf(vehicle) : EMPTY), [vehicle]);
  const router = useRouter();
  const notify = useNotify();
  const today = useToday();
  const backHref = useBackToVehiclesHref();
  const offices = useOffices();
  const create = useCreateVehicle();
  const update = useUpdateVehicle(vehicle?.id ?? 0);
  const saving = create.isPending || update.isPending;

  const [values, setValues] = useState<Values>(initial);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <F extends Field>(field: F, value: Values[F]) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Editing a field clears the server's message for it.
    setServerErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const touch = (field: Field) => setTouched((current) => ({ ...current, [field]: true }));

  const clientErrors: Partial<Record<Field, string>> = {};
  const vinProblem = vinError(values.vin);
  const plateProblem = licensePlateError(values.license_plate);
  if (vinProblem) clientErrors.vin = vinProblem;
  if (plateProblem) clientErrors.license_plate = plateProblem;
  if (!values.make.trim()) clientErrors.make = 'Make is required.';
  if (!values.model.trim()) clientErrors.model = 'Model is required.';
  const yearProblem = yearError(values.year, today);
  if (yearProblem) clientErrors.year = yearProblem;
  if (!editing && values.office === '')
    clientErrors.office = 'Pick the office this vehicle belongs to.';

  // Duplicate check while typing: debounced, and only once a value is well-formed (a
  // partial VIN would always come back "free"). Same rules as saving: an inactive vehicle
  // may reuse an active vehicle's plate, and the vehicle being edited is excluded.
  const checkKey = JSON.stringify({
    ...(!vinProblem && { vin: values.vin }),
    ...(!plateProblem && { license_plate: values.license_plate }),
    active: values.active,
    ...(vehicle && { exclude_id: vehicle.id }),
  });
  const settledKey = useDebouncedValue(checkKey);
  const checkParams = useMemo(() => JSON.parse(settledKey), [settledKey]);
  const duplicate = useDuplicateCheck(
    checkParams,
    'vin' in checkParams || 'license_plate' in checkParams,
  );
  const checkIsCurrent = settledKey === checkKey && duplicate.isSuccess;
  const conflicts = checkIsCurrent ? duplicate.data : [];
  const checking = settledKey !== checkKey || duplicate.isFetching;

  const conflictErrors: Partial<Record<Field, ReactNode>> = {};
  if (conflicts.includes('vin')) {
    conflictErrors.vin =
      'Already registered to another vehicle (VINs are unique, inactive ones included).';
  }
  if (conflicts.includes('license_plate')) {
    conflictErrors.license_plate = (
      <>
        An active vehicle already uses this plate.{' '}
        <MuiLink component="button" type="button" onClick={() => set('active', false)}>
          Save this one as inactive
        </MuiLink>
      </>
    );
  }

  const errorFor = (field: Field): ReactNode =>
    serverErrors[field] ??
    conflictErrors[field] ??
    (touched[field] || submitted ? clientErrors[field] : undefined);

  const changes = (Object.keys(values) as Field[]).filter(
    (field) => field !== 'office' && values[field] !== initial[field],
  );
  const dirty = !editing || changes.length > 0;

  function identifierAdornment(field: 'vin' | 'license_plate') {
    const relevant = field === 'vin' ? !vinProblem : !plateProblem;
    if (!relevant || !values[field]) return undefined;
    if (checking) return <CircularProgress size={18} aria-label="Checking" />;
    if (checkIsCurrent && !conflicts.includes(field)) {
      return <CheckCircleOutlineIcon color="success" fontSize="small" aria-label="Available" />;
    }
    return undefined;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(clientErrors).length || conflicts.length) return;

    const onError = (caught: unknown) => {
      const problem = toApiProblem(caught);
      if (problem.kind === 'validation') {
        setServerErrors(problem.fields);
        if (!Object.keys(problem.fields).length) setFormError(problem.message);
      } else if (problem.kind === 'conflict') {
        setFormError('Someone just saved the same VIN or plate. Check the values and try again.');
      } else {
        setFormError(problem.message);
      }
    };

    if (vehicle) {
      // PATCH only what changed (the office can't change here: it has its own action).
      const patch: Partial<VehicleInput> = {};
      for (const field of changes) {
        Object.assign(patch, { [field]: field === 'year' ? Number(values.year) : values[field] });
      }
      update.mutate(patch, {
        onSuccess: (saved) => {
          notify(`${saved.license_plate} saved.`);
          router.push(`/vehicles/${saved.id}`);
        },
        onError,
      });
    } else {
      create.mutate(
        {
          vin: values.vin,
          license_plate: values.license_plate,
          make: values.make.trim(),
          model: values.model.trim(),
          year: Number(values.year),
          office: values.office as number,
          active: values.active,
        },
        {
          onSuccess: (saved) => {
            notify(
              saved.active
                ? `${saved.license_plate} added. It's due for service until its first service is logged.`
                : `${saved.license_plate} added as inactive.`,
            );
            router.push(`/vehicles/${saved.id}`);
          },
          onError,
        },
      );
    }
  }

  const textField = (field: 'make' | 'model', label: string, placeholder: string) => (
    <TextField
      label={label}
      value={values[field]}
      onChange={(event) => set(field, event.target.value)}
      onBlur={() => touch(field)}
      error={!!errorFor(field)}
      helperText={errorFor(field)}
      placeholder={placeholder}
      required
    />
  );

  return (
    <Paper component="form" onSubmit={handleSubmit} noValidate sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={3}>
        {formError && <Alert severity="error">{formError}</Alert>}

        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <TextField
            label="VIN"
            value={values.vin}
            onChange={(event) => set('vin', event.target.value.toUpperCase())}
            onBlur={() => {
              set('vin', normalizeIdentifier(values.vin));
              touch('vin');
            }}
            error={!!errorFor('vin')}
            helperText={errorFor('vin') ?? `${values.vin.length}/17 characters`}
            required
            sx={identifierSx}
            slotProps={{
              htmlInput: { maxLength: 17, spellCheck: false, autoComplete: 'off' },
              input: {
                endAdornment: identifierAdornment('vin') && (
                  <InputAdornment position="end">{identifierAdornment('vin')}</InputAdornment>
                ),
              },
            }}
          />
          <TextField
            label="License plate"
            value={values.license_plate}
            onChange={(event) => set('license_plate', event.target.value.toUpperCase())}
            onBlur={() => {
              set('license_plate', normalizeIdentifier(values.license_plate));
              touch('license_plate');
            }}
            error={!!errorFor('license_plate')}
            helperText={
              errorFor('license_plate') ?? '"ABC 123" and "ABC-123" are different plates.'
            }
            required
            sx={identifierSx}
            slotProps={{
              htmlInput: { maxLength: 10, spellCheck: false, autoComplete: 'off' },
              input: {
                endAdornment: identifierAdornment('license_plate') && (
                  <InputAdornment position="end">
                    {identifierAdornment('license_plate')}
                  </InputAdornment>
                ),
              },
            }}
          />
          {textField('make', 'Make', 'e.g. Ford')}
          {textField('model', 'Model', 'e.g. Transit')}
          <TextField
            label="Model year"
            value={values.year}
            onChange={(event) => set('year', event.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => touch('year')}
            error={!!errorFor('year')}
            helperText={errorFor('year') ?? `${FIRST_VIN_MODEL_YEAR}–${latestModelYear(today)}`}
            required
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          {editing ? (
            <TextField
              label="Office"
              value={vehicle.office.name}
              helperText='To move this vehicle, use "Move to another office" on its page.'
              slotProps={{ input: { readOnly: true } }}
            />
          ) : (
            <TextField
              select
              label="Office"
              value={values.office}
              onChange={(event) => set('office', Number(event.target.value))}
              onBlur={() => touch('office')}
              error={!!errorFor('office')}
              helperText={errorFor('office')}
              required
            >
              {(offices.data ?? []).map((office) => (
                <MenuItem key={office.id} value={office.id}>
                  {office.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={values.active}
                onChange={(event) => set('active', event.target.checked)}
              />
            }
            label="Active"
          />
          <Typography variant="body2" color="text.secondary">
            Inactive vehicles are kept with their history but leave the active fleet and the service
            queue. Only active vehicles need a unique license plate.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
          <Button
            component={Link}
            href={vehicle ? `/vehicles/${vehicle.id}` : backHref}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={saving} disabled={!dirty}>
            {dirty ? (editing ? 'Save changes' : 'Add vehicle') : 'No changes'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
