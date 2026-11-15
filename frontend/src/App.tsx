import { Navigate, Route, Routes } from 'react-router-dom';
import { CrewAlarm } from './components/common/CrewAlarm';
import { SourceToast } from './components/common/SourceToast';
import { CameraMonitor } from './components/cv/CameraMonitor';
import { CheckInOverlay } from './components/cv/CheckInOverlay';
import { LogDrawer } from './components/routine/LogDrawer';
import { ActNowAlert } from './components/shell/ActNowAlert';
import { InboxDrawer } from './components/shell/InboxDrawer';
import { Sidebar } from './components/shell/Sidebar';
import EmergencyLogs from './pages/EmergencyLogs';
import Routine from './pages/Routine';
import { Reminders } from './components/routine/Reminders';
import Admin from './pages/Admin';
import DailyCheck from './pages/DailyCheck';
import Dashboard from './pages/Dashboard';
import Emergency from './pages/Emergency';
import EmergencyLogView from './pages/EmergencyLogView';
import ReactionPage from './pages/ReactionPage';
import Sources from './pages/Sources';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/check" element={<DailyCheck />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/emergency/log/:id" element={<EmergencyLogView />} />
        <Route path="/emergency/logs" element={<EmergencyLogs />} />
        <Route path="/routine" element={<Routine />} />
        <Route path="/reaction" element={<ReactionPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Sidebar />
      <InboxDrawer />
      <ActNowAlert />
      <SourceToast />
      <Reminders />
      <LogDrawer />
      <CameraMonitor />
      <CheckInOverlay />
      <CrewAlarm />
    </>
  );
}
