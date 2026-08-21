// ─────────────────────────────────────────────────────────────────────────
// lib/ssrf.js — sprawdzenie, czy adres URL wolno pobrać z serwera.
//
// Filtr oparty na samej NAZWIE hosta nie wystarcza. Parser URL owszem
// normalizuje zapisy liczbowe (http://2130706433 → 127.0.0.1), ale nie
// tknie nazwy domenowej: wystarczy wpis DNS wskazujący na 169.254.169.254
// albo na adres w sieci wewnętrznej i nazwa przechodzi przez każdy filtr
// tekstowy. Dlatego rozwiązujemy nazwę i oceniamy ADRESY, nie napis.
//
// Sprawdzamy wszystkie zwrócone adresy, nie tylko pierwszy — host z rekordami
// A wskazującymi i na publiczny, i na prywatny adres inaczej przechodziłby
// losowo, zależnie od kolejności odpowiedzi resolwera.
// ─────────────────────────────────────────────────────────────────────────

import { lookup } from 'node:dns/promises';
import net from 'node:net';

/** Adresy, których serwer nie ma prawa odpytywać (pętla zwrotna, sieci prywatne, metadane chmury). */
export function adresPrywatny(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127
      || (a === 169 && b === 254)                 // link-local, w tym metadane chmury
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)       // CGNAT
      || a >= 224;                                // multicast i zarezerwowane
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (l === '::1' || l === '::') return true;
    if (/^f[cd]/.test(l)) return true;            // fc00::/7 — unique local
    if (l.startsWith('fe80')) return true;        // link-local
    const zmapowany = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (zmapowany) return adresPrywatny(zmapowany[1]);
    // ::ffff:7f00:1 — ten sam adres zapisany szesnastkowo
    const hex = l.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return adresPrywatny([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    return false;
  }
  return true; // nieznany format — odrzucamy
}

/**
 * @param {string} wejscie adres do sprawdzenia
 * @returns {Promise<{ok: true, url: URL} | {ok: false, powod: string}>}
 */
export async function urlDoPobrania(wejscie) {
  let url;
  try { url = new URL(wejscie); } catch { return { ok: false, powod: 'Nieprawidłowy URL' }; }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, powod: 'Niedozwolony protokół URL' };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, powod: 'Niedozwolony adres URL' };
  // Nazwy, które z definicji prowadzą do zasobów wewnętrznych.
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) {
    return { ok: false, powod: 'Niedozwolony adres URL' };
  }
  // Adres podany wprost — bez odpytywania DNS.
  if (net.isIP(host)) {
    return adresPrywatny(host) ? { ok: false, powod: 'Niedozwolony adres URL' } : { ok: true, url };
  }

  let adresy;
  try { adresy = await lookup(host, { all: true, verbatim: true }); }
  catch { return { ok: false, powod: 'Nie udało się rozwiązać adresu' }; }
  if (!adresy.length) return { ok: false, powod: 'Nie udało się rozwiązać adresu' };
  if (adresy.some(a => adresPrywatny(a.address))) return { ok: false, powod: 'Niedozwolony adres URL' };
  return { ok: true, url };
}
