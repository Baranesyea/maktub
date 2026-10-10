import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { SettingsProvider, useSettings } from '@/lib/settings'
import { bindDriveSettings, startDriveLoop } from '@/lib/drive'
import { useToasts } from '@/lib/toast'
import { Toasts, Button } from '@/components/ui'
import Tour from '@/components/Tour'
import { AppFrame, BootScreen } from '@/components/AppShell'
import Splash, { splashLikely, shouldSplash } from '@/components/Splash'
import Home from '@/pages/Home'
import Workspace from '@/pages/Workspace'
import Reading from '@/pages/Reading'
import Plan from '@/pages/Plan'
import Timeline from '@/pages/Timeline'
import ImportPage from '@/pages/Import'
import SettingsPage from '@/pages/Settings'
import BackupPage from '@/pages/Backup'
import { Login, Register, ForgotPassword, ResetPassword } from '@/pages/Auth'

function DriveBinder() {
  const { settings, update } = useSettings()
  useEffect(() => { bindDriveSettings(() => settings, update) }, [settings, update])
  useEffect(() => { startDriveLoop() }, [])
  return null
}

/** Everything behind login: settings, Drive, and the app itself. */
function Protected() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <SettingsProvider>
      <DriveBinder />
      <AppFrame><Outlet /></AppFrame>
      <Tour />
    </SettingsProvider>
  )
}

function Shell() {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings } = useAuth()
  // The entrance splash, once per session for a signed-in writer. When a sign-in is likely it
  // starts right away and covers the sign-in check; it is dropped if that check says signed out.
  const [splash, setSplash] = useState(() => splashLikely())
  const resolved = !isLoadingAuth && !isLoadingPublicSettings
  useEffect(() => {
    if (!resolved) return
    if (isAuthenticated && shouldSplash()) setSplash(true)
    else if (!isAuthenticated) setSplash(false)
  }, [resolved, isAuthenticated])
  return (
    <>
      <ShellContent />
      {splash && <Splash onDone={() => setSplash(false)} />}
    </>
  )
}

function ShellContent() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth()
  const toasts = useToasts()
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <BootScreen />
  }
  if (authError) {
    if (authError.type === 'auth_required') { navigateToLogin(); return null }
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl">
        <p className="text-lg">{authError.type === 'offline' ? 'אין חיבור לאינטרנט.' : authError.type === 'user_not_registered' ? 'החשבון הזה לא רשום לאפליקציה.' : 'משהו השתבש בטעינה.'}</p>
        <p className="text-sm text-muted">מה שכתבת שמור במחשב, ויישלח כשהחיבור יחזור.</p>
        <Button onClick={checkAppState}>נסה שוב</Button>
      </div>
    )
  }
  return (
    <div dir="rtl" className="h-full">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Protected />}>
          <Route path="/" element={<Home />} />
          <Route path="/book/:bookId" element={<Workspace />} />
          <Route path="/book/:bookId/read" element={<Reading />} />
          <Route path="/book/:bookId/plan" element={<Plan />} />
          <Route path="/book/:bookId/timeline" element={<Timeline />} />
          <Route path="/book/:bookId/import" element={<ImportPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
      <Toasts items={toasts} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Shell />
      </Router>
    </AuthProvider>
  )
}
