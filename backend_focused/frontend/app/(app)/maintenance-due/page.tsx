import type { Metadata } from 'next';

import { MaintenanceDuePage } from '@/components/MaintenanceDuePage';

export const metadata: Metadata = { title: 'Due for service' };

export default function Page() {
  return <MaintenanceDuePage />;
}
