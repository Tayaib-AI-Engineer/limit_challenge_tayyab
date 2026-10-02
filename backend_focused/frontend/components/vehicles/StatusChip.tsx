import { Chip } from '@mui/material';

export function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <Chip label="Active" size="small" color="success" variant="outlined" />
  ) : (
    <Chip label="Inactive" size="small" variant="outlined" />
  );
}
