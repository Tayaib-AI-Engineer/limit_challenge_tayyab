'use client';

import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import Link from 'next/link';

import { ErrorState } from '@/components/ErrorState';
import {
  daysBetween,
  formatCompactMoney,
  formatDate,
  formatDaysAgo,
  formatMoney,
  formatNumber,
} from '@/lib/format';
import { useToday } from '@/lib/hooks';
import { useOfficeSummary } from '@/lib/queries';

const gridSx = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
} as const;

/** The office summary report. Each card opens the vehicle search filtered to that office. */
export function OfficesPage() {
  const summary = useOfficeSummary();
  const today = useToday();
  const offices = summary.data;

  const totals = offices && {
    vehicles: offices.reduce((sum, o) => sum + o.active_vehicle_count, 0),
    cost: offices.reduce((sum, o) => sum + o.maintenance_cost_last_year, 0),
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Offices
        </Typography>
        <Typography color="text.secondary">
          {totals
            ? `${formatNumber(offices.length)} offices · ${formatNumber(totals.vehicles)} active vehicles · ${formatMoney(totals.cost)} spent on maintenance in the last 12 months`
            : 'Active vehicles and maintenance spending per office.'}
        </Typography>
      </Box>

      {summary.isError && (
        <ErrorState
          title="Couldn't load the office summary"
          error={summary.error}
          onRetry={() => summary.refetch()}
        />
      )}

      <Box sx={gridSx}>
        {summary.isPending &&
          Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="rounded" height={168} />)}
        {offices?.map((office) => (
          <Card key={office.id} variant="outlined">
            <CardActionArea
              component={Link}
              href={`/vehicles?office=${office.id}&active=true`}
              prefetch={false}
              sx={{ height: '100%' }}
            >
              <CardContent>
                <Typography variant="h6" component="h2" noWrap title={office.name}>
                  {office.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {office.city}
                </Typography>
                <Stack direction="row" spacing={3} sx={{ mt: 1.5 }}>
                  <Box>
                    <Typography variant="h5" component="p">
                      {formatNumber(office.active_vehicle_count)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      active vehicles
                    </Typography>
                  </Box>
                  <Box>
                    <Tooltip title={formatMoney(office.maintenance_cost_last_year)}>
                      <Typography variant="h5" component="p">
                        {formatCompactMoney(office.maintenance_cost_last_year)}
                      </Typography>
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary">
                      spent, last 12 months
                    </Typography>
                  </Box>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  {office.last_maintenance
                    ? `Last service ${formatDate(office.last_maintenance)} (${formatDaysAgo(
                        daysBetween(office.last_maintenance, today),
                      )})`
                    : office.active_vehicle_count
                      ? 'No maintenance yet'
                      : 'No vehicles yet'}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}
