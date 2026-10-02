'use client';

import {
  Autocomplete,
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import type { Mechanic, Office } from '@/lib/types';
import type { VehicleSearch } from '@/lib/vehicle-search';

import { CommitTextField } from './CommitTextField';

type Props = {
  search: VehicleSearch;
  update: (changes: Partial<VehicleSearch>) => void;
  offices: Office[];
  mechanics: Mechanic[];
  /** Messages the API returned for individual parameters (400). */
  errors: Record<string, string>;
};

const STATUS_VALUES = { all: null, active: true, inactive: false } as const;
type Status = keyof typeof STATUS_VALUES;

function statusOf(active: boolean | null): Status {
  if (active === null) return 'all';
  return active ? 'active' : 'inactive';
}

const gridSx = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
  alignItems: 'start',
} as const;

export function VehicleFilters({ search, update, offices, mechanics, errors }: Props) {
  // A certification number from the URL that isn't in the list still shows as selected.
  const selectedMechanic =
    mechanics.find((m) => m.certification_number === search.mechanic_certification) ??
    (search.mechanic_certification
      ? {
          id: -1,
          name: search.mechanic_certification,
          certification_number: search.mechanic_certification,
          active: true,
        }
      : null);
  const mechanicOptions =
    selectedMechanic && selectedMechanic.id === -1 ? [...mechanics, selectedMechanic] : mechanics;

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2.5}>
        <Box sx={gridSx}>
          <TextField
            select
            label="Office"
            value={search.office ?? ''}
            onChange={(event) =>
              update({ office: event.target.value === '' ? null : Number(event.target.value) })
            }
            error={!!errors.office}
            helperText={errors.office}
          >
            <MenuItem value="">All offices</MenuItem>
            {offices.map((office) => (
              <MenuItem key={office.id} value={office.id}>
                {office.name}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              aria-label="Status"
              value={statusOf(search.active)}
              onChange={(_, status: Status | null) =>
                status && update({ active: STATUS_VALUES[status] })
              }
              sx={{ height: 56 }}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="active">Active</ToggleButton>
              <ToggleButton value="inactive">Inactive</ToggleButton>
            </ToggleButtonGroup>
            {errors.active && (
              <Typography variant="caption" color="error" sx={{ mx: 1.75 }}>
                {errors.active}
              </Typography>
            )}
          </Box>
          <CommitTextField
            label="Make"
            value={search.make}
            onCommit={(make) => update({ make })}
            helperText={errors.make ?? 'Exact match, e.g. Ford. Press Enter to apply.'}
            error={!!errors.make}
          />
          <CommitTextField
            label="Model"
            value={search.model}
            onCommit={(model) => update({ model })}
            helperText={errors.model ?? 'Exact match, e.g. Transit.'}
            error={!!errors.model}
          />
        </Box>

        <Box>
          <Typography variant="subtitle2" component="h2">
            Service history
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Finds vehicles with a maintenance record that matches all of these.
          </Typography>
          <Box sx={gridSx}>
            <TextField
              type="date"
              label="Serviced from"
              value={search.maintenance_from}
              onChange={(event) => update({ maintenance_from: event.target.value })}
              error={!!errors.maintenance_from}
              helperText={errors.maintenance_from}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: search.maintenance_to || undefined },
              }}
            />
            <TextField
              type="date"
              label="Serviced to"
              value={search.maintenance_to}
              onChange={(event) => update({ maintenance_to: event.target.value })}
              error={!!errors.maintenance_to}
              helperText={errors.maintenance_to}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: search.maintenance_from || undefined },
              }}
            />
            <Autocomplete
              options={mechanicOptions}
              value={selectedMechanic}
              onChange={(_, mechanic) =>
                update({ mechanic_certification: mechanic?.certification_number ?? '' })
              }
              getOptionLabel={(m) => `${m.name} · ${m.certification_number}`}
              isOptionEqualToValue={(a, b) => a.certification_number === b.certification_number}
              renderOption={({ key, ...optionProps }, m) => (
                <li key={key} {...optionProps}>
                  <Stack>
                    <span>
                      {m.name}
                      {!m.active && ' (inactive)'}
                    </span>
                    <Typography variant="caption" color="text.secondary">
                      {m.certification_number}
                    </Typography>
                  </Stack>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Mechanic"
                  error={!!errors.mechanic_certification}
                  helperText={errors.mechanic_certification}
                />
              )}
            />
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}
