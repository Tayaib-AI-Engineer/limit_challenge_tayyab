'use client';

import {
  Box,
  Link as MuiLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import type { Vehicle } from '@/lib/types';
import type { Ordering, SortField } from '@/lib/vehicle-search';

import { StatusChip } from './StatusChip';

type Column = {
  label: string;
  sortField?: SortField;
  hideBelow?: 'md' | 'lg';
  render: (vehicle: Vehicle) => ReactNode;
};

const mono = { fontFamily: 'var(--font-geist-mono), monospace' };

const COLUMNS: Column[] = [
  {
    label: 'Plate',
    sortField: 'license_plate',
    render: (v) => (
      <MuiLink
        component={Link}
        href={`/vehicles/${v.id}`}
        // No prefetch: a page of rows would prefetch 20 route payloads, and the vehicle's
        // data is fetched from the API by the browser anyway.
        prefetch={false}
        underline="hover"
        sx={{ ...mono, fontWeight: 600 }}
        onClick={(event) => event.stopPropagation()}
      >
        {v.license_plate}
      </MuiLink>
    ),
  },
  {
    label: 'VIN',
    sortField: 'vin',
    hideBelow: 'md',
    render: (v) => <Box sx={mono}>{v.vin}</Box>,
  },
  { label: 'Make', sortField: 'make', render: (v) => v.make },
  { label: 'Model', sortField: 'model', render: (v) => v.model },
  { label: 'Year', sortField: 'year', render: (v) => v.year },
  // Office and status can't be sorted by the API, so they get no sort control.
  { label: 'Office', hideBelow: 'lg', render: (v) => v.office_name },
  { label: 'Status', render: (v) => <StatusChip active={v.active} /> },
];

function displaySx(hideBelow?: 'md' | 'lg') {
  return hideBelow ? { display: { xs: 'none', [hideBelow]: 'table-cell' } } : undefined;
}

/** Clicking a column cycles: ascending, descending, unsorted. */
function nextOrdering(current: Ordering | null, field: SortField): Ordering | null {
  if (current === field) return `-${field}`;
  if (current === `-${field}`) return null;
  return field;
}

type Props = {
  vehicles: Vehicle[] | undefined;
  loading: boolean;
  stale: boolean;
  ordering: Ordering | null;
  onSort: (ordering: Ordering | null) => void;
  /** Shown in place of rows when there are none (empty state). */
  emptyState?: ReactNode;
};

export function VehicleTable({ vehicles, loading, stale, ordering, onSort, emptyState }: Props) {
  const router = useRouter();

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-busy={loading || stale}>
        <TableHead>
          <TableRow>
            {COLUMNS.map((column) => {
              const field = column.sortField;
              const direction = ordering?.startsWith('-') ? 'desc' : 'asc';
              const active = !!field && ordering?.replace(/^-/, '') === field;
              return (
                <TableCell
                  key={column.label}
                  sx={{ ...displaySx(column.hideBelow), fontWeight: 600, whiteSpace: 'nowrap' }}
                  sortDirection={active ? direction : false}
                >
                  {field ? (
                    <TableSortLabel
                      active={active}
                      direction={active ? direction : 'asc'}
                      onClick={() => onSort(nextOrdering(ordering, field))}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody
          sx={{ opacity: stale ? 0.55 : 1, transition: 'opacity 150ms' }}
          aria-live="polite"
        >
          {loading &&
            Array.from({ length: 8 }, (_, row) => (
              <TableRow key={row}>
                {COLUMNS.map((column) => (
                  <TableCell key={column.label} sx={displaySx(column.hideBelow)}>
                    <Skeleton />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!loading && vehicles?.length === 0 && emptyState && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} sx={{ py: 6, border: 0 }}>
                {emptyState}
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            vehicles?.map((vehicle) => (
              <TableRow
                key={vehicle.id}
                hover
                onClick={() => router.push(`/vehicles/${vehicle.id}`)}
                sx={{ cursor: 'pointer', opacity: vehicle.active ? 1 : 0.65 }}
              >
                {COLUMNS.map((column) => (
                  <TableCell
                    key={column.label}
                    sx={{ ...displaySx(column.hideBelow), whiteSpace: 'nowrap' }}
                  >
                    {column.render(vehicle)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </Box>
  );
}
