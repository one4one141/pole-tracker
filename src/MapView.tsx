import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
export type Pole={id:string;project_id:string;pole_ref:string;grid_reference:string;latitude:number;longitude:number;status:string;notes:string;data:Record<string,unknown>};
type FieldMapping={poleRef:string;gridRef:string;exchange:string;dp:string;cp:string};
const normaliseKey=(key:string)=>key.toLowerCase().replace(/[^a-z0-9]/g,'');
function fieldValue(data:Record<string,unknown>, aliases:string[]){
  const match=Object.entries(data||{}).find(([key,value])=>aliases.includes(normaliseKey(key))&&String(value??'').trim()!=='');
  return match?String(match[1]).trim():'';
}
function popupDetails(p:Pole,mapping:FieldMapping){
  const poleRef=(mapping.poleRef&&String(p.data?.[mapping.poleRef]??'').trim())||p.pole_ref;
  const gridRef=(mapping.gridRef&&String(p.data?.[mapping.gridRef]??'').trim())||p.grid_reference;
  const exchange=(mapping.exchange&&String(p.data?.[mapping.exchange]??'').trim())||fieldValue(p.data,['exchname','exchange','exchangename','exchangecode','exchangeid','exchangearea']);
  const dp=(mapping.dp&&String(p.data?.[mapping.dp]??'').trim())||fieldValue(p.data,['dp','dpno','dpnumber','dpnum','distributionpoint','distributionpointnumber','distributionpointno']);
  const cp=(mapping.cp&&String(p.data?.[mapping.cp]??'').trim())||fieldValue(p.data,['subpole','cp','cpno','cpnumber','cpnum','cabinetpoint','cabinetpointnumber','cabinetpointno']);
  return {poleRef,gridRef,exchange,dp,cp};
}
function InitialFit({poles}:{poles:Pole[]}){const map=useMap();const fitted=useRef(false);useEffect(()=>{if(fitted.current||!poles.length)return;const bounds=poles.map(p=>[p.latitude,p.longitude] as [number,number]) as LatLngBoundsExpression;if(poles.length===1)map.setView([poles[0].latitude,poles[0].longitude],15);else map.fitBounds(bounds,{padding:[45,45],maxZoom:15});fitted.current=true;},[poles,map]);return null;}
function FocusSelected({selected}:{selected:Pole|null}){const map=useMap();useEffect(()=>{if(selected)map.flyTo([selected.latitude,selected.longitude],Math.max(map.getZoom(),15),{duration:.45});},[selected?.id,map]);return null;}
export default function MapView({poles,onEdit,selected,fieldMapping}:{poles:Pole[];onEdit:(p:Pole)=>void;selected:Pole|null;fieldMapping:FieldMapping}){return <MapContainer center={[52.5,-1.8]} zoom={6} minZoom={5} maxZoom={19} scrollWheelZoom className="map"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><InitialFit poles={poles}/><FocusSelected selected={selected}/>{poles.map(p=><CircleMarker key={p.id} center={[p.latitude,p.longitude]} radius={7} pathOptions={{color:p.status==='Completed'?'#20a56b':p.status==='Problem'?'#e35c62':'#2488d8',fillColor:p.status==='Completed'?'#20a56b':p.status==='Problem'?'#e35c62':'#2488d8',fillOpacity:.95,weight:2}}><Popup><div className="map-popup"><strong>{popupDetails(p,fieldMapping).exchange||'Exchange not provided'}</strong><div className="popup-location">{popupDetails(p,fieldMapping).poleRef} · {popupDetails(p,fieldMapping).gridRef}</div><div className="popup-identifiers"><span><b>DP</b> {popupDetails(p,fieldMapping).dp||'—'}</span><span><b>CP</b> {popupDetails(p,fieldMapping).cp||'—'}</span></div><button onClick={()=>onEdit(p)}>View / edit pole</button><div className="popup-navigation"><span>Navigate to pole</span><a className="nav-google" href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" aria-label={`Navigate to ${p.pole_ref} with Google Maps`}>Google Maps ↗</a><a className="nav-apple" href={`https://maps.apple.com/?daddr=${p.latitude},${p.longitude}&dirflg=d`} target="_blank" rel="noreferrer" aria-label={`Navigate to ${p.pole_ref} with Apple Maps`}>Apple Maps ↗</a></div></div></Popup></CircleMarker>)}</MapContainer>;}
