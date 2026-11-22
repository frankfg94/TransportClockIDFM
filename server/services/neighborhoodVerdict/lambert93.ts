// RGF93 / Lambert-93 (EPSG:2154), ellipsoidal Lambert conformal conic.
const eccentricity = 0.0818191910428158;
const exponent = 0.725607765053267;
const scale = 11754255.426096;
const radians = Math.PI / 180;
type Position = [number, number];

function isometricLatitude(latitude: number): number {
  const sin = eccentricity * Math.sin(latitude);
  return Math.log(Math.tan(Math.PI / 4 + latitude / 2)) +
    eccentricity / 2 * Math.log((1 - sin) / (1 + sin));
}

export function toLambert93([lon, lat]: Position): Position {
  const distance = scale * Math.exp(-exponent * isometricLatitude(lat * radians));
  const angle = exponent * (lon - 3) * radians;
  return [700000 + distance * Math.sin(angle), 12655612.049876 - distance * Math.cos(angle)];
}

export function fromLambert93([x, y]: Position): Position {
  const dx = x - 700000;
  const dy = 12655612.049876 - y;
  const angle = Math.atan2(dx, dy);
  const iso = -Math.log(Math.hypot(dx, dy) / scale) / exponent;
  let latitude = 2 * Math.atan(Math.exp(iso)) - Math.PI / 2;
  for (let index = 0; index < 8; index++) {
    const sin = eccentricity * Math.sin(latitude);
    latitude = 2 * Math.atan(Math.exp(iso) * ((1 + sin) / (1 - sin)) ** (eccentricity / 2)) - Math.PI / 2;
  }
  return [3 + angle / exponent / radians, latitude / radians];
}
