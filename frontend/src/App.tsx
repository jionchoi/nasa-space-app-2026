import { Navigate, Route, Routes } from 'react-router-dom';
import { CrewAlarm } from './components/common/CrewAlarm';
import { SourceToast } from './components/common/SourceToast';
import { CameraMonitor } from './components/cv/CameraMonitor';
import { CheckInOverlay } from './components/cv/CheckInOverlay';
import { LogDrawer } from './components/routine/LogDrawer';
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

export default function App() {
  const {mode}=useSignals();
  const demo=mode==='demo';
  return (
    <>
      <Routes>
        <Route path="/" element={demo?<Dashboard />:<SignalDashboard/>} />
        <Route path="/check" element={demo?<DailyCheck />:<SignalCheck/>} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/emergency/log/:id" element={demo?<EmergencyLogView />:<SignalDashboard/>} />
        <Route path="/reaction" element={<ReactionPage />} />
        <Route path="/admin" element={demo?<Admin />:<SignalDashboard/>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {demo && <>
      <SourceToast />
      <Reminders />
      <LogDrawer />
      <CameraMonitor />
      <CheckInOverlay />
      <CrewAlarm />
      </>}
    </>
  );
}
