import { Chip, Tooltip } from '@mui/material';

import { daysBetween, formatDate, formatDaysAgo } from '@/lib/format';
import { OVERDUE_AFTER_DAYS } from '@/lib/rules';

type Props = {
  lastService: string | null;
  today: string;
  active: boolean;
};

/** Service state in words, never colour alone. Same rule as the "Due for service" list. */
export function ServiceStatusChip({ lastService, today, active }: Props) {
  if (!active) return null;
  if (!lastService) {
    return <Chip size="small" color="warning" label="Never serviced" />;
  }
  const days = daysBetween(lastService, today);
  const overdue = days > OVERDUE_AFTER_DAYS;
  return (
    <Tooltip title={`Last service ${formatDate(lastService)}`}>
      <Chip
        size="small"
        color={overdue ? 'warning' : 'default'}
        variant={overdue ? 'filled' : 'outlined'}
        label={
          overdue
            ? `Overdue · last serviced ${formatDaysAgo(days)}`
            : `Serviced ${formatDaysAgo(days)}`
        }
      />
    </Tooltip>
  );
}
