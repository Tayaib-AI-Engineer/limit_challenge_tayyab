'use client';

import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Link as MuiLink,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';

import { ErrorState } from '@/components/ErrorState';
import { LogServiceDialog } from '@/components/vehicles/LogServiceDialog';
import { formatDate, formatNumber, pluralize } from '@/lib/format';
import { DUE_PAGE_SIZE, useVehiclesDue } from '@/lib/queries';
import type { VehicleDue } from '@/lib/types';

const mono = { fontFamily: 'var(--font-geist-mono), monospace' };

/**
 * The work queue: active vehicles never serviced or not serviced for more than 365 days,
 * oldest first (the needing-maintenance endpoint). Logging a service here takes the
 * vehicle off the list.
 */
export function MaintenanceDuePage() {
  const [page, setPage] = useState(1);
  const due = useVehiclesDue(page);
  const [logging, setLogging] = useState<VehicleDue | null>(null);

  const total = due.data?.count;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Due for service
        </Typography>
        <Typography color="text.secondary">
          Active vehicles never serviced, or last serviced more than 365 days ago, oldest first.
        </Typography>
      </Box>

      {due.isError ? (
        <ErrorState
          title="Couldn't load the service queue"
          error={due.error}
          onRetry={() => due.refetch()}
        />
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          <Box sx={{ height: 4 }}>{due.isFetching && !due.isPending && <LinearProgress />}</Box>
          {total === 0 ? (
            <Stack spacing={1} sx={{ p: 6, alignItems: 'center', textAlign: 'center' }}>
              <CheckCircleOutlineIcon color="success" fontSize="large" />
              <Typography variant="h6" component="p">
                Nothing is due
              </Typography>
              <Typography color="text.secondary">
                Every active vehicle was serviced in the last 365 days.
              </Typography>
            </Stack>
          ) : (
            <>
              <Typography role="status" sx={{ px: 2, pt: 1.5, fontWeight: 600 }}>
                {total !== undefined ? pluralize(total, 'vehicle') + ' due' : ' '}
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Plate', 'Vehicle', 'Office', 'Last service', 'Status', ''].map(
                        (label, index) => (
                          <TableCell key={label || index} sx={{ fontWeight: 600 }}>
                            {label}
                          </TableCell>
                        ),
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody sx={{ opacity: due.isPlaceholderData ? 0.55 : 1 }}>
                    {due.isPending &&
                      Array.from({ length: 8 }, (_, row) => (
                        <TableRow key={row}>
                          <TableCell colSpan={6}>
                            <Skeleton />
                          </TableCell>
                        </TableRow>
                      ))}
                    {due.data?.results.map((vehicle) => (
                      <TableRow key={vehicle.id} hover>
                        <TableCell>
                          <MuiLink
                            component={Link}
                            href={`/vehicles/${vehicle.id}`}
                            prefetch={false}
                            underline="hover"
                            sx={{ ...mono, fontWeight: 600 }}
                          >
                            {vehicle.license_plate}
                          </MuiLink>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {vehicle.make} {vehicle.model} · {vehicle.year}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{vehicle.office_name}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {vehicle.last_maintenance
                            ? formatDate(vehicle.last_maintenance)
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          {vehicle.days_since_last_maintenance === null ? (
                            <Chip size="small" color="warning" label="Never serviced" />
                          ) : (
                            <Chip
                              size="small"
                              color="warning"
                              variant="outlined"
                              label={`${formatNumber(vehicle.days_since_last_maintenance)} days since service`}
                            />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            startIcon={<BuildOutlinedIcon />}
                            onClick={() => setLogging(vehicle)}
                          >
                            Log service
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              {!!total && total > DUE_PAGE_SIZE && (
                <TablePagination
                  component="div"
                  count={total}
                  page={page - 1}
                  onPageChange={(_, next) => setPage(next + 1)}
                  rowsPerPage={DUE_PAGE_SIZE}
                  rowsPerPageOptions={[DUE_PAGE_SIZE]}
                />
              )}
            </>
          )}
        </Paper>
      )}

      {logging && <LogServiceDialog vehicle={logging} onClose={() => setLogging(null)} />}
    </Stack>
  );
}
