import {MapContainer,TileLayer,CircleMarker,Popup,useMap} from 'react-leaflet';
import {useEffect} from 'react';
import type {LatLngBoundsExpression} from 'leaflet';
import 'leaflet/dist/leaflet.css';
export type Pole={id:string;project_id:string;pole_ref:string;grid_reference:string;latitude:number;longitude:number;status:string;notes:string;data:Record<string,unknown>};
function Fit({poles}:{poles:Pole[]}){const map=useMap();useEffect(()=>{if(poles.length){const b=poles.map(p=>[p.latitude,p.longitude] as [number,number]) as LatLngBoundsExpression;map.fitBounds(b,{padding:[35,35],maxZoom:14});}},[poles,map]);return null;}
export default function MapView({poles,onEdit}:{poles:Pole[];onEdit:(p:Pole)=>void}){return <MapContainer center={[52.5,-1.8]} zoom={6} scrollWheelZoom className="map"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Fit poles={poles}/>{poles.map(p=><CircleMarker key={p.id} center={[p.latitude,p.longitude]} radius={8} pathOptions={{color:p.status==='Completed'?'#15803d':p.status==='Problem'?'#dc2626':'#2563eb',fillOpacity:.9}}><Popup><div className="map-popup"><strong>{p.pole_ref||'Pole'}</strong><span>{p.grid_reference}</span><span className="status-text">{p.status}</span><button onClick={()=>onEdit(p)}>View / edit details</button></div></Popup></CircleMarker>)}</MapContainer>}
