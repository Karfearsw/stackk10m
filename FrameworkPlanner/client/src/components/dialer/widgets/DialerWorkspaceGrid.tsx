import { useState } from "react";
import { ResponsiveReactGridLayout, WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Button } from "@/components/ui/button";
import { Phone, RotateCcw } from "lucide-react";
import { Softphone } from "@/components/telnyx/Softphone";
import { useWidgetLayout } from "@/hooks/useWidgetLayout";
import { DIALER_WIDGETS, type WidgetLayoutItem } from "./registry";

const ResponsiveGridLayout = WidthProvider(ResponsiveReactGridLayout);

/**
 * The power-dialer workspace as a draggable/resizable widget grid.
 * Layout persists per user via useWidgetLayout; the drag handle is the widget
 * header so inner controls (buttons, inputs) never start a drag. At small
 * breakpoints every widget stacks full-width.
 */
export function DialerWorkspaceGrid() {
  const [softphoneOpen, setSoftphoneOpen] = useState(false);
  const { layout, loaded, onLayoutChange, resetLayout } = useWidgetLayout("dialer-workspace");

  const stacked = (l: WidgetLayoutItem[]) => l.map((item) => ({ ...item, x: 0, w: 12 }));

  return (
    <>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={softphoneOpen ? "default" : "outline"}
          onClick={() => setSoftphoneOpen((v) => !v)}
        >
          <Phone className="w-4 h-4 mr-2" />
          {softphoneOpen ? "Browser Softphone On" : "Browser Softphone"}
        </Button>
        <span className="text-xs text-muted-foreground">Click to call real numbers from this browser with WebRTC audio (no phone needed).</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={resetLayout} title="Reset widget layout to defaults">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset layout
        </Button>
      </div>
      {softphoneOpen ? (
        <Softphone />
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout, md: layout, sm: stacked(layout), xs: stacked(layout), xxs: stacked(layout) }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={60}
          draggableHandle=".dialer-widget-drag-handle"
          onLayoutChange={(_current: readonly WidgetLayoutItem[], all: Partial<Record<string, readonly WidgetLayoutItem[]>>) =>
            onLayoutChange([...(all.lg || _current)])
          }
          measureBeforeMount={false}
          useCSSTransforms
        >
          {DIALER_WIDGETS.map((w) => {
            const C = w.component;
            return (
              <div key={w.id} data-grid={{ ...layout.find((l) => l.i === w.id), minW: w.minW, minH: w.minH }}>
                <C />
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
      {!loaded ? <span className="sr-only">Loading saved layout…</span> : null}
    </>
  );
}
