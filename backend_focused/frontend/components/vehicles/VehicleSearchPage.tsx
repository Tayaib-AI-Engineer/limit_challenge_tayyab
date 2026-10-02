'use client';

import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  TablePagination,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import { ErrorState } from '@/components/ErrorState';
import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import { pluralize } from '@/lib/format';
import { useMechanics, useOffices, useVehicleList } from '@/lib/queries';
import {
  countFilters,
  EMPTY_SEARCH,
  LAST_SEARCH_KEY,
  PAGE_SIZES,
  serializeVehicleSearch,
  toApiParams,
  useVehicleSearch,
  type PageSize,
  type VehicleSearch,
} from '@/lib/vehicle-search';

import { FilterChips } from './FilterChips';
import { VehicleFilters } from './VehicleFilters';
import { VehicleTable } from './VehicleTable';

export function VehicleSearchPage() {
  const { search, ignored, update, replace, clearFilters } = useVehicleSearch();
  const params = useMemo(() => toApiParams(search), [search]);
  const vehicles = useVehicleList(params);
  const offices = useOffices().data ?? [];
  const mechanics = useMechanics().data ?? [];
  const notify = useNotify();

  // Values in the URL that can't be valid (a typo, an old bookmark) are dropped rather
  // than failing the whole search; the URL is corrected and the user is told.
  useEffect(() => {
    if (ignored.length === 0) return;
    replace(search);
    notify(`Ignored invalid search parameter: ${ignored.join(', ')}`, 'warning');
  }, [ignored, search, replace, notify]);

  // Remembered for the "Back to vehicles" link on a vehicle's page.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(LAST_SEARCH_KEY, serializeVehicleSearch(search));
    } catch {
      // storage unavailable: the link falls back to an unfiltered list
    }
  }, [search]);

  const problem = vehicles.isError ? toApiProblem(vehicles.error) : null;

  // A page that no longer exists (e.g. the last vehicle on it was deleted): show page 1.
  useEffect(() => {
    if (problem?.kind === 'not-found' && search.page > 1) {
      notify(`Page ${search.page} no longer exists, showing page 1.`, 'info');
      update({ page: 1 });
    }
  }, [problem?.kind, search.page, update, notify]);

  const fieldErrors = problem?.kind === 'validation' ? problem.fields : {};
  const filterCount = countFilters(search);

  const removeRejectedFilters = () => {
    const reset: Partial<VehicleSearch> = {};
    for (const key of Object.keys(fieldErrors)) {
      if (key in EMPTY_SEARCH)
        Object.assign(reset, { [key]: EMPTY_SEARCH[key as keyof VehicleSearch] });
    }
    update(reset);
  };

  const emptyState =
    filterCount > 0 ? (
      <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Typography variant="h6" component="p">
          No vehicles match these filters
        </Typography>
        <Typography color="text.secondary">
          Make and model must match exactly (e.g. &ldquo;Model 3&rdquo;, not &ldquo;Model&rdquo;).
        </Typography>
        <Button variant="outlined" onClick={clearFilters}>
          Clear all filters
        </Button>
      </Stack>
    ) : (
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="p">
          No vehicles yet
        </Typography>
        <Button variant="contained" component={Link} href="/vehicles/new" startIcon={<AddIcon />}>
          Add vehicle
        </Button>
      </Stack>
    );

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Vehicles
        </Typography>
        <Button variant="contained" component={Link} href="/vehicles/new" startIcon={<AddIcon />}>
          Add vehicle
        </Button>
      </Stack>

      <VehicleFilters
        search={search}
        update={update}
        offices={offices}
        mechanics={mechanics}
        errors={fieldErrors}
      />

      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, minHeight: 32 }}
      >
        <Typography
          role="status"
          aria-live="polite"
          sx={{ fontWeight: 600, opacity: vehicles.isPlaceholderData ? 0.55 : 1 }}
        >
          {vehicles.data ? pluralize(vehicles.data.count, 'vehicle') : ' '}
        </Typography>
        <FilterChips
          search={search}
          update={update}
          clearFilters={clearFilters}
          offices={offices}
          mechanics={mechanics}
        />
      </Stack>

      {problem?.kind === 'validation' ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={removeRejectedFilters}>
              Remove invalid filters
            </Button>
          }
        >
          {Object.keys(fieldErrors).length
            ? 'Some filters were rejected. See the highlighted fields.'
            : problem.message}
        </Alert>
      ) : (
        problem &&
        problem.kind !== 'not-found' && (
          <ErrorState
            title="Couldn't load vehicles"
            error={vehicles.error}
            onRetry={() => vehicles.refetch()}
          />
        )
      )}

      {!problem && (
        <Paper sx={{ overflow: 'hidden' }}>
          <Box sx={{ height: 4 }}>{vehicles.isFetching && <LinearProgress />}</Box>
          <VehicleTable
            vehicles={vehicles.data?.results}
            loading={vehicles.isPending}
            stale={vehicles.isPlaceholderData}
            ordering={search.ordering}
            onSort={(ordering) => update({ ordering })}
            emptyState={emptyState}
          />
          {!!vehicles.data?.count && (
            <TablePagination
              component="div"
              count={vehicles.data.count}
              page={search.page - 1}
              onPageChange={(_, page) => update({ page: page + 1 })}
              rowsPerPage={search.page_size}
              rowsPerPageOptions={[...PAGE_SIZES]}
              onRowsPerPageChange={(event) =>
                update({ page_size: Number(event.target.value) as PageSize })
              }
            />
          )}
        </Paper>
      )}
    </Stack>
  );
}
