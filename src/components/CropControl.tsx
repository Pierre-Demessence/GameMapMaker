import { useState } from "react";
import { Crop as CropIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMapStore } from "@/store/mapStore";
import type { CropKey } from "@/lib/types";

const FIELDS: { key: CropKey; label: string; axis: "w" | "h" }[] = [
  { key: "cropTop", label: "Top", axis: "h" },
  { key: "cropBottom", label: "Bottom", axis: "h" },
  { key: "cropLeft", label: "Left", axis: "w" },
  { key: "cropRight", label: "Right", axis: "w" },
];

export function CropControl() {
  const activeGameId = useMapStore((s) => s.activeGameId);
  const games = useMapStore((s) => s.games);
  const setCrop = useMapStore((s) => s.setCrop);
  const game = games.find((g) => g.id === activeGameId) ?? null;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<CropKey, number>>({
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    cropLeft: 0,
  });

  if (!game || game.cellWidth === 0) return null;

  const gameId = game.id;
  const imgW = game.cellWidth;
  const imgH = game.cellHeight;

  const openPanel = () => {
    setDraft({
      cropTop: game.cropTop ?? 0,
      cropRight: game.cropRight ?? 0,
      cropBottom: game.cropBottom ?? 0,
      cropLeft: game.cropLeft ?? 0,
    });
    setOpen(true);
  };

  const update = (key: CropKey, axis: "w" | "h", raw: number) => {
    const max = Math.max(0, (axis === "w" ? imgW : imgH) - 1);
    const value = Math.min(max, Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0)));
    setDraft((d) => ({ ...d, [key]: value }));
    void setCrop(gameId, { [key]: value } as Partial<Record<CropKey, number>>);
  };

  const reset = () => {
    const zero: Record<CropKey, number> = {
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
      cropLeft: 0,
    };
    setDraft(zero);
    void setCrop(gameId, zero);
  };

  const effW = imgW - draft.cropLeft - draft.cropRight;
  const effH = imgH - draft.cropTop - draft.cropBottom;

  return (
    <>
      <Button
        variant={open ? "default" : "secondary"}
        size="sm"
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <CropIcon /> Crop
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="mb-1 text-sm font-medium">Crop rooms</div>
          <p className="mb-3 text-xs text-muted-foreground">
            Trim the same margin from every image — handy when a UI bar shifts the game. Values are
            pixels of the original screenshot.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs">
                {f.label}
                <Input
                  type="number"
                  min={0}
                  value={draft[f.key]}
                  onChange={(e) => update(f.key, f.axis, e.target.valueAsNumber)}
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Room size: {Math.max(1, effW)}×{Math.max(1, effH)}px
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              Reset
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
