const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const server = http.createServer((req, res) => {
  // CORS headers — sta verzoeken toe van elke origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/anonimiseer') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let tekst;
      try {
        tekst = JSON.parse(body).tekst;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ongeldige JSON' }));
        return;
      }

      if (!tekst) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geen tekst meegegeven' }));
        return;
      }

      const prompt = `Je bent een AVG-privacytool. Anonimiseer ALLE persoonsgegevens in de tekst hieronder.

Vervang de volgende categorieën door het bijbehorende label:
- Volledige namen, voornamen, achternamen, roepnamen, initialen (T. Jansen, W.J.G. Riel) → <PERSOON>
- Bedrijfsnamen (ook bv, B.V., nv, VOF, Ltd etc.) → <BEDRIJF>
- Woonplaats, geboorteplaats → <PLAATS>
- Personeelsnummer, klantnummer, lidnummer, studentnummer, dossiernummer → <ID-NUMMER>
- Leeftijd als herleidbaar naar persoon → <LEEFTIJD>
- Kenteken → <KENTEKEN>
- Gebruikers-ID, pasnummer, werkstation → <ID-NUMMER>
- Bestandsnamen met persoonsgegevens erin → <BESTANDSNAAM>

Deze labels zijn al vervangen en moet je laten staan:
<IBAN>, <BSN>, <E-MAIL>, <TELEFOON>, <ADRES>, <POSTCODE>, <BEDRAG>, <DATUM>, <TIJD>, <IP-ADRES>

Regels:
- Vervang ELKE voorkomen, ook als een naam 10x voorkomt
- Wees consistent: dezelfde naam altijd hetzelfde label
- Houd de rest van de tekst EXACT hetzelfde
- Geef ALLEEN de geanonimiseerde tekst terug, geen uitleg of extra tekst

Tekst:
${tekst}`;

      const payload = JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const apiReq = https.request(options, apiRes => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const result = parsed.content?.[0]?.text || tekst;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result }));
          } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Fout bij verwerking API-antwoord' }));
          }
        });
      });

      apiReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Kan Anthropic API niet bereiken' }));
      });

      apiReq.write(payload);
      apiReq.end();
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`PrivacyShield proxy draait op poort ${PORT}`);
});
