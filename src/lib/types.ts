export interface Game {
  id: string;
  name: string;
  cellWidth: number;
  cellHeight: number;
  createdAt: number;
  updatedAt: number;
}

export interface ImageRec {
  id: string;
  gameId: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
  createdAt: number;
}

export interface Tile {
  id: string;
  gameId: string;
  imageId: string;
  gx: number;
  gy: number;
}
