/**
 * Auth route group layout — no sidebar, no Nav.
 * Wraps /login and /register pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
