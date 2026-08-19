import { AppShell } from '@/components/app-shell'

export default function ConsoleLayout({ children }: LayoutProps<'/'>) {
  return <AppShell>{children}</AppShell>
}
