import proj4 from 'proj4';
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +units=m +no_defs +type=crs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs');
const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
function gridLettersToEN(ref: string): [number, number] | null {
  const s = ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^([A-Z]{2})(\d{2,10})$/); if (!m || m[2].length % 2) return null;
  const l1 = letters.indexOf(m[1][0]); const l2 = letters.indexOf(m[1][1]);
  if (l1 < 0 || l2 < 0) return null;
  const e100 = ((l1 - 2 + 25) % 5) * 5 + (l2 % 5);
  const n100 = 19 - Math.floor(l1 / 5) * 5 - Math.floor(l2 / 5);
  if (e100 < 0 || e100 > 6 || n100 < 0 || n100 > 12) return null;
  const digits = m[2].length / 2; const scale = 10 ** (5 - digits);
  const e = e100 * 100000 + Number(m[2].slice(0, digits)) * scale;
  const n = n100 * 100000 + Number(m[2].slice(digits)) * scale;
  return [e + scale / 2, n + scale / 2];
}
export function gridRefToLatLng(ref: string): {latitude:number;longitude:number} | null {
  const en = gridLettersToEN(ref); if (!en) return null;
  const [longitude, latitude] = proj4('EPSG:27700', 'EPSG:4326', en);
  if (latitude < 49 || latitude > 61 || longitude < -9 || longitude > 3) return null;
  return { latitude, longitude };
}
