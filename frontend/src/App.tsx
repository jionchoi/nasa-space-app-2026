import { Navigate, Route, Routes } from 'react-router-dom';
import { CrewAlarm } from './components/common/CrewAlarm';
import { SourceToast } from './components/common/SourceToast';
import { PublicModeNotice } from './components/common/PublicModeNotice';
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
import SignalDashboard from './pages/SignalDashboard';
import SignalCheck from './pages/SignalCheck';
import { useSignals } from './state/SignalContext';
import DailyCheck from './pages/DailyCheck';
import Dashboard from './pages/Dashboard';
import Emergency from './pages/Emergency';
import EmergencyLogView from './pages/EmergencyLogView';
import ReactionPage from './pages/ReactionPage';
import Sources from './pages/Sources';

export default function App() {
  const {mode}=useSignals();
  const demo=mode==='demo';
  return (
    <>
      <Routes>
        <Route path="/" element={demo?<Dashboard />:<SignalDashboard/>} />
        <Route path="/check" element={demo?<DailyCheck />:<SignalCheck/>} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/emergency/log/:id" element={demo ? <EmergencyLogView /> : <SignalDashboard />} />
        <Route path="/emergency/logs" element={demo ? <EmergencyLogs /> : <SignalDashboard />} />
        <Route path="/routine" element={demo ? <Routine /> : <SignalDashboard />} />
        <Route path="/reaction" element={<ReactionPage />} />
        <Route path="/admin" element={demo ? <Admin /> : <SignalDashboard />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Sidebar />
      {demo && <>
      <InboxDrawer />
      <ActNowAlert />
      <SourceToast />
      <PublicModeNotice />
      <Reminders />
      <LogDrawer />
      <CameraMonitor />
      <CheckInOverlay />
      <CrewAlarm />
      </>}
    </>
  );
}
