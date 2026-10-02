import type { Metadata } from 'next';

import { OfficesPage } from '@/components/OfficesPage';

export const metadata: Metadata = { title: 'Offices' };

export default function Page() {
  return <OfficesPage />;
}
