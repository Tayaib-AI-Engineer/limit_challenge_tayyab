'use client';

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Box,
  Chip,
  IconButton,
  LinearProgress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/format';
import { useDeleteMaintenanceRecord, useVehicleHistory } from '@/lib/queries';
import { MAINTENANCE_TYPES, type HistoryRecord } from '@/lib/types';

const PAGE_SIZE = 10;

/**
 * Pages through /maintenance-history/ rather than rendering the full history from the
 * detail response, so a vehicle with hundreds of records stays light in the DOM.
 */
export function HistoryTable({ vehicleId }: { vehicleId: number }) {
  const [page, setPage] = useState(1);
  const history = useVehicleHistory(vehicleId, page, PAGE_SIZE);
  const notify = useNotify();
  const remove = useDeleteMaintenanceRecord();
  const [toDelete, setToDelete] = useState<HistoryRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (history.isError) {
    return (
      <ErrorState
        title="Couldn't load the maintenance history"
        error={history.error}
        onRetry={() => history.refetch()}
      />
    );
  }

  const records = history.data?.results;
  const total = history.data?.count ?? 0;

  return (
    <Box>
      <Box sx={{ height: 4 }}>{history.isFetching && !history.isPending && <LinearProgress />}</Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Date', 'Type', 'Mechanic', 'Cost', 'Notes', ''].map((label, index) => (
                <TableCell
                  key={label || index}
                  align={label === 'Cost' ? 'right' : 'left'}
                  sx={{ fontWeight: 600 }}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody sx={{ opacity: history.isPlaceholderData ? 0.55 : 1 }}>
            {history.isPending &&
              Array.from({ length: 5 }, (_, row) => (
                <TableRow key={row}>
                  <TableCell colSpan={6}>
                    <Skeleton />
                  </TableCell>
                </TableRow>
              ))}
            {records?.map((record) => (
              <TableRow key={record.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(record.date)}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={MAINTENANCE_TYPES[record.maintenance_type]}
                  />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {record.mechanic.name}
                  <Typography variant="caption" color="text.secondary" component="div">
                    {record.mechanic.certification_number}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(record.cost)}
                </TableCell>
                <TableCell sx={{ maxWidth: 280 }}>
                  <Typography variant="body2" noWrap title={record.notes}>
                    {record.notes || '—'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Delete record">
                    <IconButton
                      size="small"
                      aria-label={`Delete the ${formatDate(record.date)} record`}
                      onClick={() => setToDelete(record)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {total > PAGE_SIZE && (
        <TablePagination
          component="div"
          count={total}
          page={page - 1}
          onPageChange={(_, next) => setPage(next + 1)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this maintenance record?"
          confirmLabel="Delete record"
          destructive
          pending={remove.isPending}
          error={deleteError}
          onClose={() => {
            setToDelete(null);
            setDeleteError(null);
          }}
          onConfirm={() =>
            remove.mutate(toDelete.id, {
              onSuccess: () => {
                notify('Maintenance record deleted.');
                setToDelete(null);
                // Deleting the only record on the last page: step back a page.
                if (records?.length === 1 && page > 1) setPage(page - 1);
              },
              onError: (caught) => setDeleteError(toApiProblem(caught).message),
            })
          }
        >
          {MAINTENANCE_TYPES[toDelete.maintenance_type]} on {formatDate(toDelete.date)} by{' '}
          {toDelete.mechanic.name} ({formatMoney(toDelete.cost)}). Totals and the service status
          will be recalculated.
        </ConfirmDialog>
      )}
    </Box>
  );
}
