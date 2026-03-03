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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  try {
    // Use Claude Vision directly to read and parse the table
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
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
              text: `Look at this baseball statistics table image. I need you to extract data by visually reading each column.

For each pitch type row, look at the column header and read the value DIRECTLY below it in that row. Trace your eye down from each header to get the correct value.

Extract these fields for each pitch:
- "pitchType": from Pitch Type column
- "usage": from P% column (convert to decimal: 54.7% = 0.547)
- "velocity": from Vel column
- "spin": from Spin column
- "iVB": from iVB column (PRESERVE NEGATIVE SIGNS like -4.1)
- "horzBrk": from HorzBrk column (PRESERVE NEGATIVE SIGNS like -2.6)
- "extension": from Extension column
- "relHt": from Rel Ht column
- "relSide": from RelSide column
- "vaa": from VertApprAngle column (PRESERVE NEGATIVE SIGNS like -4.40)
- "strikePercent": from Strike% column
- "zonePercent": from InZone% column (this is zone rate, typically 40-60%)
- "swgStrkPercent": from SwStrk% column (swinging strike rate, typically 8-20%)
- "whiffPercent": from Whiff% column (typically 20-40%)
- "chasePercent": from Chase% column (typically 20-35%)
- "zoneWhiffPercent": from InZoneWhiff% column (typically 10-30%, comes AFTER Chase%)
- "groundBallPercent": from Ground% column (typically 25-55%, near end of table)
- "flyBallPercent": from Fly% column (typically 20-45%, last % column before xSLG)

CRITICAL INSTRUCTIONS:
1. For each column, visually trace DOWN from the header to find the correct value
2. InZone% and InZoneWhiff% are DIFFERENT columns - read both
3. PRESERVE all negative signs for iVB, HorzBrk, and vaa
4. Use null for missing or "-" values
5. Only include rows that have numeric iVB and HorzBrk values
6. Percentages should be numbers only (32% becomes 32)

Return ONLY a valid JSON array, no explanation or markdown formatting.`
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
    
    // Clean and parse JSON
    let cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response:', text);
      return res.status(500).json({ error: 'Failed to parse response' });
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      return res.status(500).json({ error: 'Failed to parse JSON' });
    }
    
    const filtered = parsed.filter(p => p.usage >= usageThreshold && p.iVB !== null && p.horzBrk !== null);
    
    return res.status(200).json({ pitchData: filtered });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Failed to process image: ' + err.message });
  }
}
