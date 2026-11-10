import { useEffect, useRef } from "react";
import { Joyride } from "react-joyride";
import type { Controls, EventData, PartialDeep, Step, Styles } from "react-joyride";
import type { ThemeId } from "@/data/theme";

export interface TourGuideProps {
  run: boolean;
  theme: ThemeId;
  onEnd: () => void;
}

interface TourPalette {
  tooltipBackground: string;
  border: string;
  text: string;
  title: string;
  primary: string;
  primaryText: string;
  subtleText: string;
  arrow: string;
  overlay: string;
}

// Neutral values mirrored from the app's palette; Joyride portals its
// tooltips to document.body, outside the [data-theme] scope, so both theme
// variants are passed explicitly.
const DARK_PALETTE: TourPalette = {
  tooltipBackground: "#262626", // neutral-800
  border: "#404040", // neutral-700
  text: "#e5e5e5", // neutral-200
  title: "#fafafa", // neutral-50
  primary: "#f5f5f5", // neutral-100
  primaryText: "#0a0a0a", // neutral-950
  subtleText: "#a3a3a3", // neutral-400
  arrow: "#262626",
  overlay: "rgba(10, 10, 10, 0.72)",
};

const LIGHT_PALETTE: TourPalette = {
  tooltipBackground: "#ffffff",
  border: "#e5e5e5",
  text: "#404040",
  title: "#171717",
  primary: "#171717",
  primaryText: "#f5f5f5",
  subtleText: "#525252",
  arrow: "#ffffff",
  overlay: "rgba(23, 23, 23, 0.5)",
};

const TOUR_STEPS: Array<Step> = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Day Labels",
    content:
      "Day Labels records your day as it happens — one label at a time. This short tour walks you through the loop. It only runs once; the ? button in the header replays it anytime.",
  },
  {
    target: '[data-tour="day-clock"]',
    placement: "bottom",
    title: "The Day clock",
    content:
      "A Day runs for exactly 24 hours from the Anchor — the local midnight of your first launch. This clock measures the current one, always counting up from 00:00:00.",
  },
  {
    target: '[data-tour="labels"]',
    placement: "top",
    title: "Say what's happening",
    content:
      "Tap a label to make it the Active label — the pulsing marker shows what's being recorded right now. Unaccounted is the built-in fallback whenever nothing else is picked. Keys 1–9 switch labels too.",
  },
  {
    target: '[data-tour="new-label"]',
    placement: "bottom",
    title: "Make it yours",
    content:
      "Create a label with a name and a colour. Grow the list to match your day.",
  },
  {
    target: '[data-tour="blocks"]',
    placement: "top",
    title: "Your day becomes Blocks",
    content:
      "Each stretch of an active label is recorded as a Block — the ongoing one ticks live. Open a block's ⋯ menu to split or relabel it.",
  },
  {
    target: '[data-tour="totals"]',
    placement: "top",
    title: "See where the day went",
    content:
      "The selected day as a pie chart plus seven-day totals per label. Unaccounted time is always visible.",
  },
  {
    target: '[data-tour="timeline"]',
    placement: "top",
    title: "The 24-hour timeline",
    content:
      "See your entire day mapped across a continuous 24-hour bar. Each colour-coded segment reflects your recorded blocks, making your rhythm and gaps easy to spot at a glance.",
  },
  {
    target: "body",
    placement: "center",
    title: "That's the loop",
    content:
      "Use the day picker in the header to review past days, and the export menu to save your history as JSON or CSV. An account is optional — one device works fine on its own.",
  },
];

function tooltipStyles(palette: TourPalette): PartialDeep<Styles> {
  return {
    tooltip: {
      backgroundColor: palette.tooltipBackground,
      border: `1px solid ${palette.border}`,
      borderRadius: 12,
      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
      padding: 20,
      fontSize: 14,
      textAlign: "left",
    },
    tooltipTitle: {
      color: palette.title,
      fontSize: 15,
      fontWeight: 600,
      margin: 0,
    },
    tooltipContent: {
      color: palette.text,
      lineHeight: 1.5,
      paddingBottom: 16,
      paddingTop: 10,
    },
    tooltipFooter: {
      marginTop: 4,
    },
    buttonPrimary: {
      backgroundColor: palette.primary,
      borderRadius: 8,
      color: palette.primaryText,
      fontSize: 14,
      fontWeight: 600,
      padding: "6px 14px",
    },
    buttonBack: {
      border: `1px solid ${palette.border}`,
      borderRadius: 8,
      color: palette.text,
      fontSize: 14,
      padding: "6px 14px",
    },
    buttonSkip: {
      borderRadius: 8,
      color: palette.subtleText,
      fontSize: 13,
      padding: "6px 8px",
    },
    overlay: {
      backgroundColor: palette.overlay,
    },
  };
}

export default function TourGuide({ run, theme, onEnd }: TourGuideProps) {
  const palette = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  const controlsRef = useRef<Controls | null>(null);

  const handleEvent = (data: EventData, controls: Controls) => {
    controlsRef.current = controls;

    if (data.type === "tour:end") {
      onEnd();
    }
  };

  // Joyride's dismissKeyAction only maps Escape to close/next/replay, never
  // skip, so it's disabled above and Escape is handled here instead: it ends
  // the tour as a skip, the same as the "Skip tour" button.
  useEffect(() => {
    if (!run) {
      controlsRef.current = null;
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        controlsRef.current?.skip("button_skip");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [run]);

  return (
    <Joyride
      run={run}
      steps={TOUR_STEPS}
      continuous
      locale={{
        back: "Back",
        last: "Finish",
        next: "Next",
        skip: "Skip tour",
      }}
      options={{
        buttons: ["skip", "back", "primary"],
        disableFocusTrap: true,
        dismissKeyAction: false,
        skipBeacon: true,
        backgroundColor: palette.tooltipBackground,
        textColor: palette.text,
        primaryColor: palette.primary,
        arrowColor: palette.arrow,
        spotlightPadding: 8,
        spotlightRadius: 10,
      }}
      styles={tooltipStyles(palette)}
      onEvent={handleEvent}
    />
  );
}
