"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, MapPin, Minus, Plus, Search, X } from "lucide-react";
import { useBodyScrollLock, usePortalReady } from "@/lib/useMobileUi";
import type { NativePlacePickerSelection as MapPlaceSelection } from "@/lib/nativePlacePicker";

type SearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type Props = {
  initial?: Partial<MapPlaceSelection>;
  onClose: () => void;
  onSelect: (selection: MapPlaceSelection) => void;
};

const TILE_SIZE = 256;
const DEFAULT_CENTER = { latitude: 37.5665, longitude: 126.978 };
let lastGeocodeRequestAt = 0;

function clampLatitude(value: number) {
  return Math.max(-85.0511, Math.min(85.0511, value));
}

function worldPoint(latitude: number, longitude: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const lat = clampLatitude(latitude) * Math.PI / 180;
  return {
    x: (longitude + 180) / 360 * worldSize,
    y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * worldSize,
  };
}

function coordinatesFromWorld(x: number, y: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const normalizedX = ((x % worldSize) + worldSize) % worldSize;
  const clampedY = Math.max(0, Math.min(worldSize, y));
  return {
    longitude: normalizedX / worldSize * 360 - 180,
    latitude: 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * clampedY / worldSize))),
  };
}

export function MapPlacePicker({ initial, onClose, onSelect }: Props) {
  const portalReady = usePortalReady();
  const [center, setCenter] = useState({
    latitude: initial?.latitude ?? DEFAULT_CENTER.latitude,
    longitude: initial?.longitude ?? DEFAULT_CENTER.longitude,
  });
  const [zoom, setZoom] = useState(15);
  const [query, setQuery] = useState(initial?.addressLabel || "");
  const [addressLabel, setAddressLabel] = useState(initial?.addressLabel || "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const drag = useRef<{ pointerId: number; x: number; y: number; worldX: number; worldY: number; moved: boolean } | null>(null);
  useBodyScrollLock(true);

  const tiles = useMemo(() => {
    const point = worldPoint(center.latitude, center.longitude, zoom);
    const baseX = Math.floor(point.x / TILE_SIZE);
    const baseY = Math.floor(point.y / TILE_SIZE);
    const max = 2 ** zoom;
    return Array.from({ length: 25 }, (_, index) => {
      const column = index % 5 - 2;
      const row = Math.floor(index / 5) - 2;
      const rawX = baseX + column;
      const x = ((rawX % max) + max) % max;
      const y = Math.max(0, Math.min(max - 1, baseY + row));
      return {
        key: `${zoom}:${rawX}:${y}`,
        src: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        left: rawX * TILE_SIZE - point.x,
        top: y * TILE_SIZE - point.y,
      };
    });
  }, [center, zoom]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setMessage("");
    try {
      const waitMs = Math.max(0, 1_000 - (Date.now() - lastGeocodeRequestAt));
      if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      lastGeocodeRequestAt = Date.now();
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");
      url.searchParams.set("accept-language", "ko");
      url.searchParams.set("q", query.trim());
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("search failed");
      const data = await response.json() as SearchResult[];
      setResults(data);
      if (!data.length) setMessage("검색 결과가 없어요. 도로명이나 건물명을 조금 더 자세히 입력해주세요.");
    } catch {
      setMessage("주소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSearching(false);
    }
  }

  function chooseResult(result: SearchResult) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    setCenter({ latitude, longitude });
    setAddressLabel(result.display_name);
    setQuery(result.display_name);
    setResults([]);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const point = worldPoint(center.latitude, center.longitude, zoom);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, worldX: point.x, worldY: point.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
    setCenter(coordinatesFromWorld(start.worldX - dx, start.worldY - dy, zoom));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) setAddressLabel("");
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!portalReady) return null;
  return createPortal(
    <div className="map-picker-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="map-picker-card" role="dialog" aria-modal="true" aria-labelledby="map-picker-title">
        <header>
          <div><p className="eyebrow">PLACE PICKER</p><h2 id="map-picker-title">지도에서 장소 선택</h2></div>
          <button type="button" onClick={onClose} aria-label="지도 닫기"><X size={19} /></button>
        </header>

        <form className="map-picker-search" onSubmit={(event) => void search(event)}>
          <Search size={17} />
          <input className="selectable-text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="도로명, 건물명 또는 장소 검색" aria-label="장소 검색" />
          <button type="submit" disabled={searching || !query.trim()}>{searching ? <LoaderCircle className="spin" size={16} /> : "검색"}</button>
        </form>
        <small className="map-picker-provider-note">검색어는 장소를 찾기 위해 OpenStreetMap 검색 서비스로 전송됩니다. 자동 검색 없이 검색 버튼을 누른 경우에만 요청합니다.</small>
        {results.length > 0 && <div className="map-picker-results">{results.map((result) => <button type="button" key={result.place_id} onClick={() => chooseResult(result)}><MapPin size={15} /><span>{result.display_name}</span></button>)}</div>}
        {message && <p className="map-picker-message" role="status">{message}</p>}

        <div className="map-picker-map" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }}>
          <div className="map-picker-tiles" aria-hidden="true">
            {tiles.map((tile) => <img key={tile.key} src={tile.src} alt="" draggable={false} style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }} />)}
          </div>
          <span className="map-picker-pin" aria-label="선택 위치"><MapPin size={34} fill="currentColor" /></span>
          <div className="map-picker-zoom">
            <button type="button" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.min(18, value + 1)); }} aria-label="지도 확대"><Plus size={17} /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.max(11, value - 1)); }} aria-label="지도 축소"><Minus size={17} /></button>
          </div>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()}>© OpenStreetMap contributors</a>
        </div>

        <div className="map-picker-selection">
          <strong>{addressLabel || "지도의 중심 핀 위치"}</strong>
          <small>{center.latitude.toFixed(6)}, {center.longitude.toFixed(6)}</small>
        </div>
        <footer>
          <button type="button" onClick={onClose}>취소</button>
          <button type="button" className="primary" onClick={() => onSelect({ ...center, addressLabel: addressLabel || `${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)}` })}><MapPin size={16} /> 이 위치 선택</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
