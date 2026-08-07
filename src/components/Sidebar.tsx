import { type ChangeEvent, useRef, useState } from "react";
import { Download, Map, MoreHorizontal, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMapStore } from "@/store/mapStore";
import { exportGameZip } from "@/lib/backup";
import { cn } from "@/lib/utils";

interface NameDialogState {
  mode: "create" | "rename";
  gameId?: string;
  value: string;
}

export function Sidebar() {
  const games = useMapStore((s) => s.games);
  const activeGameId = useMapStore((s) => s.activeGameId);
  const selectGame = useMapStore((s) => s.selectGame);
  const createGame = useMapStore((s) => s.createGame);
  const renameGame = useMapStore((s) => s.renameGame);
  const deleteGame = useMapStore((s) => s.deleteGame);
  const importBackup = useMapStore((s) => s.importBackup);

  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitName = async () => {
    if (!nameDialog) return;
    if (nameDialog.mode === "create") await createGame(nameDialog.value);
    else if (nameDialog.gameId) await renameGame(nameDialog.gameId, nameDialog.value);
    setNameDialog(null);
  };

  const confirmDelete = async () => {
    if (deleteId) await deleteGame(deleteId);
    setDeleteId(null);
  };

  const handleExport = async (id: string) => {
    const result = await exportGameZip(id);
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      await importBackup(file);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    }
  };

  const deleteTarget = games.find((g) => g.id === deleteId);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Map className="size-5" />
        <span className="font-semibold">Game Map Maker</span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => setNameDialog({ mode: "create", value: "" })}
          >
            <Plus /> New game
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Import backup (.zip)"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload />
          </Button>
        </div>
        {importError && <p className="text-xs text-destructive">{importError}</p>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => void onImportFile(e)}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {games.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No games yet. Create one to start.
          </p>
        ) : (
          <ul className="space-y-1">
            {games.map((g) => (
              <li key={g.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                    g.id === activeGameId
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50",
                  )}
                >
                  <button
                    className="flex-1 truncate text-left"
                    onClick={() => void selectGame(g.id)}
                    title={g.name}
                  >
                    {g.name}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6 opacity-0 group-hover:opacity-100 data-popup-open:opacity-100"
                        >
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          setNameDialog({ mode: "rename", gameId: g.id, value: g.name })
                        }
                      >
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleExport(g.id)}>
                        <Download /> Export backup
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteId(g.id)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <Dialog
        open={nameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setNameDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{nameDialog?.mode === "rename" ? "Rename game" : "New game"}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDialog?.value ?? ""}
            placeholder="Game name"
            onChange={(e) => setNameDialog((s) => (s ? { ...s, value: e.target.value } : s))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitName();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitName()}>
              {nameDialog?.mode === "rename" ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the game and all its images. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
