const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/anonimiseer') {
    if (!API_KEY) {
      console.error('ANTHROPIC_API_KEY niet ingesteld!');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API key niet geconfigureerd' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let tekst;
      try {
        tekst = JSON.parse(body).tekst;
      } catch (e) {
        console.error('JSON parse fout:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ongeldige JSON' }));
        return;
      }

      if (!tekst) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geen tekst meegegeven' }));
        return;
      }

      console.log(`Tekst ontvangen: ${tekst.length} tekens`);

      const prompt = `Je bent een AVG-privacytool. Vervang ALLE persoonsgegevens in de tekst door labels.

STAP 1 - Vervang alle persoonsnamen door <PERSOON>:
- Volledige namen: Jan de Vries, Sophie Jansen, Sanne de Bruin
- Namen met tussenvoegsel: Jeroen Michiel van Ommen, Fatima El Amrani
- Initialen + achternaam: W.J.G. Riel, T. Hellfayer
- Elk voorkomen, ook als de naam al eerder vervangen is
- Ook namen in zinnen zoals "opgesteld door Pieter Lammers" of "verstuurd door Fatima El Amrani"

STAP 2 - Vervang bedrijfsnamen door <BEDRIJF>:
- Alles met bv, B.V., nv, VOF, Ltd, GmbH, Inc achteraan

STAP 3 - Vervang woon- en geboorteplaatsen door <PLAATS>:
- Alleen als het gaat om waar iemand woont of geboren is

STAP 4 - Vervang nog niet vervangen ID-nummers door <ID-NUMMER>:
- Personeelsnummers zoals P-2024-0671 of EMP-123
- Klantnummers, lidnummers, studentnummers

STAP 5 - Vervang leeftijden die herleidbaar zijn door <LEEFTIJD>

Laat deze labels precies zoals ze zijn:
<IBAN>, <BSN>, <E-MAIL>, <TELEFOON>, <ADRES>, <POSTCODE>, <BEDRAG>, <DATUM>, <TIJD>, <IP-ADRES>, <KENTEKEN>, <ID-NUMMER>, <GEBRUIKERS-ID>, <WERKSTATION>, <BESTANDSNAAM>

KRITIEKE REGELS:
- Vervang ELKE naam, ook als die 10x voorkomt
- Geef UITSLUITEND de geanonimiseerde tekst terug, geen uitleg
- Verander niks aan de rest van de tekst

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
            if (parsed.error) {
              console.error('Anthropic API fout:', parsed.error);
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: parsed.error.message }));
              return;
            }
            const result = parsed.content?.[0]?.text || tekst;
            console.log(`Resultaat: ${result.length} tekens`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result }));
          } catch (e) {
            console.error('Parse fout:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Fout bij verwerking' }));
          }
        });
      });

      apiReq.on('error', err => {
        console.error('API verbindingsfout:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Kan Anthropic API niet bereiken' }));
      });

      apiReq.write(payload);
      apiReq.end();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Niet gevonden' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PrivacyShield proxy draait op poort ${PORT}`);
  console.log(`API key aanwezig: ${!!API_KEY}`);
});
