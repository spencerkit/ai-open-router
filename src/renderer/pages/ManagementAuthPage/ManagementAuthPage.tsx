import type React from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { RemoteManagementLogin } from "@/components"
import type { AuthSessionStatus } from "@/types"

export interface ManagementAuthPageProps {
  authSession: AuthSessionStatus | null
  isHeadlessRuntime: boolean
  onSubmit: (password: string) => Promise<void>
}

export interface RequireManagementAuthProps {
  authSession: AuthSessionStatus | null
  isHeadlessRuntime: boolean
  children?: React.ReactNode
}

function isManagementLocked(
  authSession: AuthSessionStatus | null,
  isHeadlessRuntime: boolean
): boolean {
  return Boolean(
    isHeadlessRuntime &&
      authSession?.remoteRequest &&
      authSession.passwordConfigured &&
      !authSession.authenticated
  )
}

function sanitizeManagementNextTarget(value: string | null | undefined): string {
  if (!value) {
    return "/"
  }

  let decoded = value.trim()
  if (!decoded) {
    return "/"
  }

  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return "/"
  }

  if (!decoded.startsWith("/")) {
    return "/"
  }
  if (decoded.startsWith("//")) {
    return "/"
  }
  if (decoded.startsWith("/management")) {
    decoded = decoded.slice("/management".length) || "/"
  }
  if (decoded.startsWith("/auth")) {
    return "/"
  }
  return decoded.startsWith("/") ? decoded : `/${decoded}`
}

export const RequireManagementAuth: React.FC<RequireManagementAuthProps> = ({
  authSession,
  isHeadlessRuntime,
  children,
}) => {
  const location = useLocation()

  if (isHeadlessRuntime && authSession === null) {
    return null
  }

  if (!isManagementLocked(authSession, isHeadlessRuntime)) {
    return <>{children}</>
  }

  const next = encodeURIComponent(`${location.pathname}${location.search}`)
  return <Navigate to={`/auth?next=${next}`} replace />
}

export const ManagementAuthPage: React.FC<ManagementAuthPageProps> = ({
  authSession,
  isHeadlessRuntime,
  onSubmit,
}) => {
  const location = useLocation()
  const navigate = useNavigate()

  if (isHeadlessRuntime && authSession === null) {
    return null
  }

  if (!isManagementLocked(authSession, isHeadlessRuntime)) {
    const next = sanitizeManagementNextTarget(new URLSearchParams(location.search).get("next"))
    return <Navigate to={next} replace />
  }

  return (
    <RemoteManagementLogin
      onSubmit={async password => {
        await onSubmit(password)
        const next = sanitizeManagementNextTarget(new URLSearchParams(location.search).get("next"))
        navigate(next, { replace: true })
      }}
    />
  )
}
