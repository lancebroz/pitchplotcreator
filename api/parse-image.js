export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, usageThreshold } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: imageBase64 }
            },
            {
              type: 'text',
              text: `Extract pitch data from this baseball statistics table screenshot. Read each column carefully - the columns are in this exact order:

Pitch Type - Ungrouped | P% | ERA | xFIP | SIERA | SO%-BB% | P | Vel | Spin | SpinEff | iVB | HorzBrk | Extension | Rel Ht | RelSide | VertApprAngle | RelTilt | BrkTilt | Strike% | InZone% | CSW% | CallStrk% | SwStrk% | Whiff% | Chase% | InZoneWhiff% | PutAway% | BIP | Ground% | Fly% | xSLG | xwOBAcon

IMPORTANT: Pay close attention to these specific columns:
- "InZone%" is column 20 (comes right after Strike%)
- "SwStrk%" is column 23 (comes after CallStrk%, this is swinging strike percentage)
- "Whiff%" is column 24 (comes right after SwStrk%)
- "Chase%" is column 25 (comes right after Whiff%)
- "InZoneWhiff%" is column 26 (comes right after Chase%)
- "Ground%" is column 29 (comes after BIP)

Return ONLY a JSON array. For each pitch row, extract:
- "pitchType": from first column "Pitch Type - Ungrouped"
- "usage": from "P%" column as decimal (e.g., 52.1% becomes 0.521)
- "velocity": from "Vel" column as number
- "spin": from "Spin" column as number
- "iVB": from "iVB" column as number
- "horzBrk": from "HorzBrk" column as number
- "extension": from "Extension" column as number
- "relHt": from "Rel Ht" column as number (column 14, release height)
- "relSide": from "RelSide" column as number (column 15, release side)
- "vaa": from "VertApprAngle" column as number
- "strikePercent": from "Strike%" column as number (column 19)
- "zonePercent": from "InZone%" column as number (column 20, NOT InZoneWhiff%)
- "swgStrkPercent": from "SwStrk%" column as number (column 23, swinging strike %)
- "whiffPercent": from "Whiff%" column as number (column 24)
- "chasePercent": from "Chase%" column as number (column 25)
- "zoneWhiffPercent": from "InZoneWhiff%" column as number (column 26)
- "groundBallPercent": from "Ground%" column as number (column 29)
- "flyBallPercent": from "Fly%" column as number (column 30)

Only include pitches with numeric iVB and HorzBrk values. Use null for missing/"-" values.
Return ONLY valid JSON array, no markdown or explanation.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API request failed' });
    }

    const text = data.content.map(item => item.text || '').join('');
    
    // Clean the response - remove markdown formatting if present
    let cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Try to find JSON array in the response
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response:', text);
      return res.status(500).json({ error: 'Failed to parse response - no valid JSON found' });
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw text:', jsonMatch[0]);
      return res.status(500).json({ error: 'Failed to parse JSON response' });
    }
    
    const filtered = parsed.filter(p => p.usage >= usageThreshold && p.iVB !== null && p.horzBrk !== null);
    
    return res.status(200).json({ pitchData: filtered });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Failed to process image: ' + err.message });
  }
}
