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
              text: `Extract data from this baseball statistics table. 

IMPORTANT: Read the column headers from LEFT to RIGHT carefully. The table has many percentage columns that look similar - pay close attention to the EXACT header name for each column.

For each pitch type row that has numeric iVB and HorzBrk values, extract:

1. "pitchType": The pitch name (first column)
2. "usage": P% value as decimal (e.g., 56.2% becomes 0.562)
3. "velocity": Vel column value
4. "spin": Spin column value  
5. "iVB": iVB column value
6. "horzBrk": HorzBrk column value
7. "extension": Extension column value
8. "relHt": Rel Ht column value
9. "relSide": RelSide column value
10. "vaa": VertApprAngle column value (negative number like -4.80)
11. "strikePercent": Strike% column (usually 55-75%)
12. "zonePercent": InZone% column (usually 30-70%, this is NOT InZoneWhiff%)
13. "swgStrkPercent": SwStrk% column (usually 5-20%, small percentages)
14. "whiffPercent": Whiff% column (usually 15-40%)
15. "chasePercent": Chase% column (usually 20-50%)
16. "zoneWhiffPercent": InZoneWhiff% column (usually 15-45%)
17. "groundBallPercent": Ground% column (usually 30-60%, this is near the END of the table)
18. "flyBallPercent": Fly% column (usually 15-50%, this is the LAST percentage column before xSLG)

KEY DISTINCTIONS:
- InZone% comes BEFORE CSW% and is typically 30-70%
- InZoneWhiff% comes AFTER Chase% and is typically 15-45%  
- SwStrk% (swinging strike) is typically 5-20% - much lower than Whiff%
- Ground% and Fly% are the LAST two percentage columns (before xSLG/xwOBAcon if present)

Return ONLY a valid JSON array. Use null for missing/"-" values.
Example format:
[{"pitchType":"Fastball (4S)","usage":0.562,"velocity":95.4,"spin":2304,"iVB":-14.4,"horzBrk":6.7,"extension":6.58,"relHt":5.6,"relSide":1.6,"vaa":-4.80,"strikePercent":72.3,"zonePercent":64,"swgStrkPercent":10.5,"whiffPercent":21,"chasePercent":25.5,"zoneWhiffPercent":18.3,"groundBallPercent":46.1,"flyBallPercent":27.3}]`
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
