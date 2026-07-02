const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
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

      const prompt = `Je bent een AVG-privacytool. Vervang ALLE persoonsgegevens in de tekst door labels.

STAP 1 - Vervang alle persoonsnamen door <PERSOON>:
- Volledige namen: Jan de Vries, Sophie Jansen, Sanne de Bruin
- Namen met tussenvoegsel: Jeroen Michiel van Ommen, Fatima El Amrani
- Initialen + achternaam: W.J.G. Riel, T. Hellfayer
- Elk voorkomen, ook als de naam al eerder is vervangen
- Ook namen in zinnen zoals "opgesteld door Pieter Lammers" of "verstuurd door Fatima El Amrani"

STAP 2 - Vervang bedrijfsnamen door <BEDRIJF>:
- Alles met bv, B.V., nv, VOF, Ltd, GmbH, Inc achteraan

STAP 3 - Vervang woon- en geboorteplaatsen door <PLAATS>:
- Alleen als het gaat om waar iemand woont of geboren is

STAP 4 - Vervang nog niet vervangen ID-nummers door <ID-NUMMER>:
- Personeelsnummers zoals P-2024-0671 of EMP-123
- Klantnummers, lidnummers, studentnummers
- Dossiernummers die nog niet zijn vervangen

STAP 5 - Vervang leeftijden die herleidbaar zijn door <LEEFTIJD>:
- "de 34-jarige medewerker"

Laat deze labels precies zoals ze zijn (al eerder vervangen):
<IBAN>, <BSN>, <E-MAIL>, <TELEFOON>, <ADRES>, <POSTCODE>, <BEDRAG>, <DATUM>, <TIJD>, <IP-ADRES>, <KENTEKEN>, <ID-NUMMER>, <GEBRUIKERS-ID>, <WERKSTATION>, <BESTANDSNAAM>

KRITIEKE REGELS:
- Vervang ELKE naam, ook als die 5x of 10x voorkomt in de tekst
- Geef UITSLUITEND de geanonimiseerde tekst terug
- Geen uitleg, geen samenvatting, geen extra tekst eromheen
- Verander niks aan de rest van de tekst

Tekst om te anonimiseren:
\${tekst}\``;

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
