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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: imageBase64 }
            },
            {
              type: 'text',
              text: `Extract pitch data from this baseball statistics table. Return ONLY a JSON array with objects containing these exact fields:
- "pitchType": the pitch name from "Pitch Type - Ungrouped" column
- "usage": the P% value as a decimal (e.g., 52.1% becomes 0.521)
- "velocity": the Vel value as a number
- "spin": the Spin value as a number
- "iVB": the iVB value as a number
- "horzBrk": the HorzBrk value as a number
- "extension": the Extension value as a number
- "relHt": the Rel Ht value as a number
- "vaa": the VertApprAngle value as a number
- "strikePercent": the Strike% value as a number (e.g., 72.0% becomes 72.0)
- "zonePercent": the InZone% value as a number
- "swgStrkPercent": the SwStrk% value as a number
- "whiffPercent": the Whiff% value as a number
- "chasePercent": the Chase% value as a number
- "zoneWhiffPercent": the InZoneWhiff% value as a number
- "groundBallPercent": the Ground% value as a number
- "flyBallPercent": the Fly% value as a number

Only include pitches that have numeric values for iVB and HorzBrk columns.
Return ONLY the JSON array, no other text or markdown.`
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
    const cleanJson = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    const filtered = parsed.filter(p => p.usage >= usageThreshold && p.iVB !== null && p.horzBrk !== null);
    
    return res.status(200).json({ pitchData: filtered });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Failed to process image' });
  }
}
