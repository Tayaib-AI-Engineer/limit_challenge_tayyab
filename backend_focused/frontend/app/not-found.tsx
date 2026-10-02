import { Box, Button, Typography } from '@mui/material';

// A server component: it can't hand next/link (a function) to MUI's client Button, so the
// button is a plain link; a full page load is fine on a 404.
export default function NotFound() {
  return (
    <Box sx={{ textAlign: 'center', mt: 12, px: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Page not found
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        This address doesn&apos;t match any page.
      </Typography>
      <Button variant="contained" href="/vehicles">
        Go to vehicles
      </Button>
    </Box>
  );
}
