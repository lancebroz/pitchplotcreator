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
              text: `You are extracting data from a baseball pitch statistics table. Look at the column headers carefully and extract the values for each pitch type row.

STEP 1: First, identify all the column headers in the table. Common headers include:
- Pitch Type - Ungrouped (or just Pitch Type)
- P% (usage percentage)
- Vel (velocity)
- Spin
- iVB (induced vertical break)
- HorzBrk (horizontal break)
- Extension
- Rel Ht (release height)
- RelSide (release side)
- VertApprAngle (vertical approach angle)
- Strike%
- InZone% (NOT the same as InZoneWhiff%)
- CSW%
- CallStrk%
- SwStrk% (swinging strike percentage)
- Whiff%
- Chase%
- InZoneWhiff% (in-zone whiff rate, different from InZone%)
- PutAway%
- BIP (balls in play count)
- Ground% (ground ball percentage - this comes AFTER BIP)
- Fly% (fly ball percentage - this comes AFTER Ground%)

STEP 2: For each pitch type row, extract these values by matching the column header:

Return a JSON array with objects containing:
- "pitchType": string from the Pitch Type column
- "usage": number (P% as decimal, e.g., 52.1% = 0.521)
- "velocity": number from Vel column
- "spin": number from Spin column
- "iVB": number from iVB column
- "horzBrk": number from HorzBrk column
- "extension": number from Extension column
- "relHt": number from Rel Ht column
- "relSide": number from RelSide column
- "vaa": number from VertApprAngle column
- "strikePercent": number from Strike% column (just the number, e.g., 72.0 not 72.0%)
- "zonePercent": number from InZone% column (this is the zone rate, typically 30-70%)
- "swgStrkPercent": number from SwStrk% column (swinging strike rate, typically 5-20%)
- "whiffPercent": number from Whiff% column (typically 15-50%)
- "chasePercent": number from Chase% column (typically 20-40%)
- "zoneWhiffPercent": number from InZoneWhiff% column (typically 10-30%)
- "groundBallPercent": number from Ground% column (this is ground ball rate, typically 20-60%, found AFTER BIP column)
- "flyBallPercent": number from Fly% column (this is fly ball rate, typically 20-50%, found AFTER Ground% column)

CRITICAL: 
- InZone% and InZoneWhiff% are DIFFERENT columns - don't confuse them
- SwStrk% is swinging strike rate (usually 5-20%), different from Whiff% (usually higher)
- Ground% is the ground ball percentage (comes after BIP column, before Fly%)
- Fly% is the fly ball percentage (comes after Ground% column)
- Use null for any missing or "-" values
- Only include rows that have numeric iVB and HorzBrk values

Return ONLY the JSON array, no explanation or markdown.`
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
