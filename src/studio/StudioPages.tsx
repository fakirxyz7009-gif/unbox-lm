/** Renders a studio page by id (see sections.ts); the shell shows it over the workspace tabs. */
import React from 'react';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { DevicesPage } from './pages/DevicesPage.tsx';
import { ExportPage } from './pages/ExportPage.tsx';
import { MetersPage } from './pages/MetersPage.tsx';
import { MasteringPage } from './pages/MasteringPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import type { PageId } from './sections.ts';

export function StudioPage({ id, onOpenDevice, onOpenRear }: { id: PageId; onOpenDevice: (deviceId: string) => void; onOpenRear: () => void }) {
  switch (id) {
    case 'projects':
      return <ProjectsPage />;
    case 'export':
      return <ExportPage />;
    case 'meters':
      return <MetersPage />;
    case 'mastering':
      return <MasteringPage />;
    case 'settings':
      return <SettingsPage />;
    case 'instruments':
    case 'drums':
    case 'synths':
    case 'sampler':
    case 'effects':
    case 'patchbay':
      return <DevicesPage key={id} cat={id} onOpenDevice={onOpenDevice} onOpenRear={onOpenRear} />;
  }
}
