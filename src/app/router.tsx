import { Navigate, Route, Routes } from "react-router-dom";
import { FieldShell } from "@/components/layout/FieldShell";
import { LandingPage } from "@/routes/landing/LandingPage";
import { MapPage } from "@/routes/map/MapPage";
import { NearbyPage } from "@/routes/nearby/NearbyPage";
import { CreatePage } from "@/routes/create/CreatePage";
import { SavedPage } from "@/routes/saved/SavedPage";
import { ProfilePage } from "@/routes/profile/ProfilePage";
import { SettingsPage } from "@/routes/settings/SettingsPage";
import { OfflineReadinessPage } from "@/routes/offline-readiness/OfflineReadinessPage";
import { SyncStatusPage } from "@/routes/sync-status/SyncStatusPage";
import { PrototypeControlsPage } from "@/routes/prototype-controls/PrototypeControlsPage";

export function AppRouter() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route element={<FieldShell />}>
        <Route path="app" element={<MapPage />} />
        <Route path="explore" element={<Navigate to="/app" replace />} />
        <Route path="burningman/sidequester" element={<Navigate to="/app" replace />} />
        <Route path="nearby" element={<NearbyPage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="saved" element={<SavedPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="offline-readiness" element={<OfflineReadinessPage />} />
        <Route path="sync-status" element={<SyncStatusPage />} />
        <Route path="prototype-controls" element={<PrototypeControlsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
