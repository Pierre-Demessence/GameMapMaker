import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { GridCanvas } from "@/components/GridCanvas";
import { useMapStore } from "@/store/mapStore";

function App() {
  const init = useMapStore((s) => s.init);
  const ready = useMapStore((s) => s.ready);
  const activeGameId = useMapStore((s) => s.activeGameId);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="relative flex-1">
          {ready ? (
            <GridCanvas key={activeGameId ?? "none"} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Loading…
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
