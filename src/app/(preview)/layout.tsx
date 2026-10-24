import { DEFAULT_BRANDING } from "@/lib/branding";
import { AppNav } from "@/components/app-nav";
import { MobileShell } from "@/components/mobile-shell";
import { PageHelp } from "@/components/page-help";
import { AiAssistant } from "@/components/ai-assistant";
import { BackupReminder } from "@/components/backup-reminder";
import { BlurWrapper } from "@/components/blur-wrapper";
import { GlobalSearch } from "@/components/global-search";
import { UpdateBanner } from "@/components/update-banner";
import { UndoToast } from "@/components/undo-toast";

export default function PreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppNav branding={DEFAULT_BRANDING} userName="Demo User" role="owner" />
      <main className="ios-page-enter min-w-0 flex-1 overflow-y-auto pb-[calc(76px+var(--safe-bottom))] pt-[calc(48px+var(--safe-top))] md:pb-0 md:pt-0"><BlurWrapper>{children}</BlurWrapper></main>
      <MobileShell userName="Demo User" role="owner" />
      <UpdateBanner />
      <GlobalSearch />
      <PageHelp />
      <AiAssistant />
      <BackupReminder />
      <UndoToast />
    </div>
  );
}
