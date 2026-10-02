'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Alert, Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import Link from 'next/link';

import { ErrorState } from '@/components/ErrorState';
import { toApiProblem } from '@/lib/errors';
import { useBackToVehiclesHref } from '@/lib/hooks';
import { useVehicle } from '@/lib/queries';

import { VehicleForm } from './VehicleForm';

export function NewVehiclePage() {
  const backHref = useBackToVehiclesHref();
  return (
    <Stack spacing={2} sx={{ maxWidth: 880 }}>
      <Box>
        <Button component={Link} href={backHref} startIcon={<ArrowBackIcon />} size="small">
          Back to vehicles
        </Button>
      </Box>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
        Add vehicle
      </Typography>
      <VehicleForm />
    </Stack>
  );
}

export function EditVehiclePage({ id }: { id: string }) {
  const valid = /^[1-9]\d*$/.test(id);
  const vehicle = useVehicle(valid ? Number(id) : 0, valid);

  let content;
  if (!valid || (vehicle.isError && toApiProblem(vehicle.error).kind === 'not-found')) {
    content = (
      <Alert severity="warning">This vehicle doesn&apos;t exist. It may have been deleted.</Alert>
    );
  } else if (vehicle.isError) {
    content = (
      <ErrorState
        title="Couldn't load this vehicle"
        error={vehicle.error}
        onRetry={() => vehicle.refetch()}
      />
    );
  } else if (vehicle.isPending) {
    content = <Skeleton variant="rounded" height={420} />;
  } else {
    content = <VehicleForm vehicle={vehicle.data} />;
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 880 }}>
      <Box>
        <Button
          component={Link}
          href={valid ? `/vehicles/${id}` : '/vehicles'}
          startIcon={<ArrowBackIcon />}
          size="small"
        >
          Back to vehicle
        </Button>
      </Box>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
        {vehicle.data ? `Edit ${vehicle.data.license_plate}` : 'Edit vehicle'}
      </Typography>
      {content}
    </Stack>
  );
}
