import { AppShell } from "@/components/kass/AppShell";

export default function KassLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
