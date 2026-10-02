'use client';

import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { AppBar, Box, Button, Chip, Container, Stack, Toolbar, Typography } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { tokenStore, useUsername } from '@/lib/auth';
import { useVehiclesDue } from '@/lib/queries';

const NAV = [
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/maintenance-due', label: 'Due for service' },
  { href: '/offices', label: 'Offices' },
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const username = useUsername();
  // Page 1 of the due list is shared with the "Due for service" page through the cache.
  const dueCount = useVehiclesDue(1).data?.count;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: { xs: 1, md: 0 } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 2 }}>
            <LocalShippingOutlinedIcon color="primary" />
            <Typography
              variant="h6"
              component="span"
              sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Fleet Maintenance
            </Typography>
          </Stack>
          <Stack
            component="nav"
            aria-label="Main"
            direction="row"
            spacing={0.5}
            sx={{ flexGrow: 1 }}
          >
            {NAV.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Button
                  key={href}
                  component={Link}
                  href={href}
                  // Links to the current route without prefetch: next 16.2.1 can otherwise
                  // reset in-page URL updates after prefetching the same pathname.
                  prefetch={false}
                  color={active ? 'primary' : 'inherit'}
                  aria-current={active ? 'page' : undefined}
                  sx={{ fontWeight: active ? 700 : 500 }}
                >
                  {label}
                  {href === '/maintenance-due' && !!dueCount && (
                    <Chip
                      component="span"
                      size="small"
                      color="warning"
                      label={dueCount}
                      aria-label={`${dueCount} vehicles due`}
                      sx={{ ml: 1, height: 20, fontWeight: 700 }}
                    />
                  )}
                </Button>
              );
            })}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {username && (
              <Typography variant="body2" color="text.secondary">
                {username}
              </Typography>
            )}
            <Button
              color="inherit"
              startIcon={<LogoutIcon />}
              onClick={() => tokenStore.signOut('signed-out')}
            >
              Sign out
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="xl" sx={{ py: 3, flexGrow: 1 }}>
        {children}
      </Container>
    </Box>
  );
}
