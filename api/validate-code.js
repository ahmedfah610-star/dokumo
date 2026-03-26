// Kody rabatowe — edytuj tutaj aby dodać/usunąć kody
// Format: 'KOD': procentRabatu (np. 20 = 20% zniżki)
const CODES = {
  'WELCOME20': 20,
  'LAUNCH30': 30,
  'VIP50': 50,
};

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const code = (req.query.code || '').toUpperCase().trim();
  const percent = CODES[code];
  if (!percent) return res.status(200).json({ valid: false });
  return res.status(200).json({ valid: true, percent });
}
