import ExportMenu from "./ExportMenu";
import ThemeToggle from "./ThemeToggle";
import type { ThemeId } from "@/data/theme";

const accountButtonClass =
  "min-h-8 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600";

interface DayOption {
  dayIndex: number;
  dayLabel: string;
}

interface AppHeaderProps {
  theme: ThemeId;
  onToggleTheme: () => void;
  onOpenAccount: () => void;
  onStartTour: () => void;
  selectedDayIndex: number;
  dayOptions: DayOption[];
  onSelectDay: (dayIndex: number) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  isSignedIn?: boolean;
}

export default function AppHeader({
  theme,
  onToggleTheme,
  onOpenAccount,
  onStartTour,
  selectedDayIndex,
  dayOptions,
  onSelectDay,
  onExportJson,
  onExportCsv,
  isSignedIn = false,
}: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-5">
      <div className="flex items-center gap-2">
        <h1 className="text-xs font-semibold tracking-[0.28em] text-neutral-500 uppercase">
          Day Labels
        </h1>
        <button
          type="button"
          onClick={onStartTour}
          aria-label="Show tour"
          title="Show tour"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-[11px] font-medium text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
        >
          ?
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onOpenAccount} className={accountButtonClass}>
          Account
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <select
          aria-label="Day"
          value={selectedDayIndex}
          onChange={(event) => {
            onSelectDay(Number(event.target.value));
          }}
          className="min-h-8 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
        >
          {dayOptions.map((option) => (
            <option key={option.dayIndex} value={option.dayIndex}>
              {option.dayLabel}
            </option>
          ))}
        </select>
        <ExportMenu onExportJson={onExportJson} onExportCsv={onExportCsv} />
      </div>
      <div className="flex w-full flex-col gap-0.5 text-xs text-neutral-500">
        <p>No import is available; an exported file cannot be restored here.</p>
        {!isSignedIn ? (
          <p>
            Clearing site data is permanent and cannot be undone; keep an export as
            a backup.
          </p>
        ) : null}
      </div>
    </header>
  );
}
