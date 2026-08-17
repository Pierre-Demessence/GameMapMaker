export interface Game {
  id: string;
  name: string;
  cellWidth: number;
  cellHeight: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  createdAt: number;
  updatedAt: number;
}

export type CropKey = "cropTop" | "cropRight" | "cropBottom" | "cropLeft";

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
  imageId?: string;
  gx: number;
  gy: number;
  note?: string;
}

export type MarkerIcon = "pin" | "star" | "flag" | "gem" | "skull";

export interface RoomMarker {
  id: string;
  gameId: string;
  tileId: string;
  u: number;
  v: number;
  label: string;
  icon: MarkerIcon;
  color: string;
  note?: string;
  createdAt: number;
}

export interface ZoneLink {
  id: string;
  gameId: string;
  fromTileId: string;
  fromU: number;
  fromV: number;
  toTileId: string;
  toU: number;
  toV: number;
  label: string;
  twoWay: boolean;
  color: string;
  note?: string;
  createdAt: number;
}
