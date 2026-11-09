import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type Pole = {
  id: string; project_id: string; pole_ref: string; grid_reference: string;
  latitude: number; longitude: number; status: string; notes: string;
  data: Record<string, unknown>;
};

function InitialFit({ poles }: { poles: Pole[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || poles.length === 0) return;
    const bounds = poles.map(p => [p.latitude, p.longitude] as [number, number]) as LatLngBoundsExpression;
    if (poles.length === 1) map.setView([poles[0].latitude, poles[0].longitude], 14);
    else map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
    fitted.current = true;
  }, [poles, map]);
  return null;
}

function FocusSelected({ selected }: { selected: Pole | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), { duration: 0.45 });
  }, [selected?.id, map]);
  return null;
}

export default function MapView({ poles, onEdit, selected }: {
  poles: Pole[]; onEdit: (p: Pole) => void; selected: Pole | null;
}) {
  return <MapContainer center={[52.5, -1.8]} zoom={6} scrollWheelZoom className="map">
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <InitialFit poles={poles} />
    <FocusSelected selected={selected} />
    {poles.map(p => <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={7}
      pathOptions={{ color: p.status === 'Completed' ? '#15803d' : p.status === 'Problem' ? '#dc2626' : '#2563eb', fillOpacity: .9 }}>
      <Popup><div className="map-popup"><strong>{p.pole_ref || 'Pole'}</strong><span>{p.grid_reference}</span>
        <span className="status-text">{p.status}</span><button onClick={() => onEdit(p)}>View / edit details</button></div></Popup>
    </CircleMarker>)}
  </MapContainer>;
}
