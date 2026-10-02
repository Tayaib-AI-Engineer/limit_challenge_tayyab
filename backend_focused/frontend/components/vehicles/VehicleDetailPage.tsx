'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ErrorState } from '@/components/ErrorState';
import { useNotify } from '@/components/SnackbarProvider';
import { toApiProblem } from '@/lib/errors';
import {
  daysBetween,
  formatDate,
  formatDaysAgo,
  formatMoney,
  oneYearBefore,
  pluralize,
} from '@/lib/format';
import { useBackToVehiclesHref, useToday } from '@/lib/hooks';
import { useUpdateVehicle, useVehicle } from '@/lib/queries';
import type { VehicleDetail } from '@/lib/types';

import { DeleteVehicleDialog } from './DeleteVehicleDialog';
import { HistoryTable } from './HistoryTable';
import { LogServiceDialog } from './LogServiceDialog';
import { MoveOfficeDialog } from './MoveOfficeDialog';
import { ServiceStatusChip } from './ServiceStatusChip';
import { StatusChip } from './StatusChip';

const mono = { fontFamily: 'var(--font-geist-mono), monospace' };

type Dialog = 'log' | 'move' | 'delete' | null;

export function VehicleDetailPage({ id }: { id: string }) {
  // Checked before any request: /vehicles/abc is simply not a vehicle.
  if (!/^[1-9]\d*$/.test(id)) return <NotFound />;
  return <VehicleDetail vehicleId={Number(id)} />;
}

function NotFound() {
  const backHref = useBackToVehiclesHref();
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Alert severity="warning">This vehicle doesn&apos;t exist. It may have been deleted.</Alert>
      <Button component={Link} href={backHref} startIcon={<ArrowBackIcon />}>
        Back to vehicles
      </Button>
    </Stack>
  );
}

function VehicleDetail({ vehicleId }: { vehicleId: number }) {
  const vehicle = useVehicle(vehicleId);
  const backHref = useBackToVehiclesHref();

  if (vehicle.isPending) return <DetailSkeleton />;
  if (vehicle.isError) {
    if (toApiProblem(vehicle.error).kind === 'not-found') return <NotFound />;
    return (
      <ErrorState
        title="Couldn't load this vehicle"
        error={vehicle.error}
        onRetry={() => vehicle.refetch()}
      />
    );
  }
  return <VehicleView vehicle={vehicle.data} backHref={backHref} />;
}

function VehicleView({ vehicle, backHref }: { vehicle: VehicleDetail; backHref: string }) {
  const router = useRouter();
  const today = useToday();
  const notify = useNotify();
  const update = useUpdateVehicle(vehicle.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const records = vehicle.maintenance_records; // complete history, newest first
  const lastService = records[0]?.date ?? null;
  const yearAgo = oneYearBefore(today);
  const spentLastYear = records
    .filter((record) => record.date >= yearAgo)
    .reduce((sum, record) => sum + record.cost, 0);
  const spentTotal = records.reduce((sum, record) => sum + record.cost, 0);

  const setActive = (active: boolean) => {
    setMenuAnchor(null);
    update.mutate(
      { active },
      {
        onSuccess: () =>
          notify(`${vehicle.license_plate} ${active ? 'reactivated' : 'deactivated'}.`),
        onError: (caught) => notify(toApiProblem(caught).message, 'error'),
      },
    );
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Button component={Link} href={backHref} startIcon={<ArrowBackIcon />} size="small">
          Back to vehicles
        </Button>
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1" sx={{ ...mono, fontWeight: 700 }}>
              {vehicle.license_plate}
            </Typography>
            <StatusChip active={vehicle.active} />
            <ServiceStatusChip lastService={lastService} today={today} active={vehicle.active} />
          </Stack>
          <Typography color="text.secondary">
            {vehicle.make} {vehicle.model} · {vehicle.year} · VIN{' '}
            <Box component="span" sx={mono}>
              {vehicle.vin}
            </Box>
          </Typography>
          <Typography>
            Office: <strong>{vehicle.office.name}</strong>, {vehicle.office.city}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={<BuildOutlinedIcon />}
            onClick={() => setDialog('log')}
          >
            Log service
          </Button>
          <Button
            variant="outlined"
            component={Link}
            href={`/vehicles/${vehicle.id}/edit`}
            startIcon={<EditOutlinedIcon />}
          >
            Edit
          </Button>
          <IconButton aria-label="More actions" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                setDialog('move');
              }}
            >
              Move to another office
            </MenuItem>
            <MenuItem onClick={() => setActive(!vehicle.active)}>
              {vehicle.active ? 'Deactivate' : 'Reactivate'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                setDialog('delete');
              }}
              sx={{ color: 'error.main' }}
            >
              Delete
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      {!vehicle.active && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setActive(true)}
              loading={update.isPending}
            >
              Reactivate
            </Button>
          }
        >
          This vehicle is inactive: it isn&apos;t listed as due for service, and its license plate
          can be reused by an active vehicle.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        <Stat
          label="Last service"
          value={lastService ? formatDate(lastService) : 'Never'}
          detail={lastService ? formatDaysAgo(daysBetween(lastService, today)) : 'No records yet'}
        />
        <Stat label="Services" value={pluralize(records.length, 'record')} />
        <Stat label="Spent, last 12 months" value={formatMoney(spentLastYear)} />
        <Stat label="Spent, all time" value={formatMoney(spentTotal)} />
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <Stack
          direction="row"
          sx={{ px: 2, pt: 2, pb: 1, justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant="h6" component="h2">
            Maintenance history
          </Typography>
        </Stack>
        {records.length === 0 ? (
          <Stack spacing={1.5} sx={{ p: 4, alignItems: 'center', textAlign: 'center' }}>
            <Typography>Never serviced. This vehicle is due for its first service.</Typography>
            <Button variant="outlined" onClick={() => setDialog('log')}>
              Log first service
            </Button>
          </Stack>
        ) : (
          <HistoryTable vehicleId={vehicle.id} />
        )}
      </Paper>

      {dialog === 'log' && <LogServiceDialog vehicle={vehicle} onClose={() => setDialog(null)} />}
      {dialog === 'move' && <MoveOfficeDialog vehicle={vehicle} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <DeleteVehicleDialog
          vehicle={vehicle}
          onClose={() => setDialog(null)}
          onDeleted={() => router.push(backHref)}
        />
      )}
    </Stack>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      )}
    </Paper>
  );
}

function DetailSkeleton() {
  return (
    <Stack spacing={3} aria-busy>
      <Skeleton width={140} />
      <Skeleton variant="text" width={320} height={56} />
      <Skeleton width={420} />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={88} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={320} />
    </Stack>
  );
}
