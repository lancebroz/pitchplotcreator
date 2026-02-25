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
              text: `You are extracting data from a baseball statistics table. You must read EXACTLY what is in each column by matching the column header precisely.

STEP 1: Look at the header row. Find these EXACT column headers (they may appear in any order):
- "Pitch Type" or "Pitch Type - Ungrouped" (pitch name)
- "P%" (usage percentage)
- "Vel" (velocity)
- "Spin" (spin rate)
- "iVB" (induced vertical break - CAN BE NEGATIVE)
- "HorzBrk" (horizontal break - CAN BE NEGATIVE)
- "Extension" (release extension)
- "Rel Ht" (release height)
- "RelSide" (release side)
- "VertApprAngle" (approach angle - usually NEGATIVE)
- "Strike%" (strike percentage)
- "InZone%" (in-zone rate - NOT the same as InZoneWhiff%)
- "SwStrk%" (swinging strike rate)
- "Whiff%" (whiff rate)
- "Chase%" (chase rate)
- "InZoneWhiff%" (in-zone whiff rate - different column from InZone%)
- "Ground%" (ground ball rate)
- "Fly%" (fly ball rate)

IMPORTANT DISTINCTIONS - these are DIFFERENT columns:
- "InZone%" is zone rate (how often pitches are in the zone) - typically 30-70%
- "InZoneWhiff%" is in-zone whiff rate (whiffs on pitches in the zone) - typically 10-40%
- "CSW%" is called strike + whiff rate - this is NOT InZone%
- "SwStrk%" is swinging strike rate - typically 5-20%

STEP 2: For each pitch row, read the value DIRECTLY below each header. Do not skip columns or shift values.

STEP 3: Return a JSON array. PRESERVE NEGATIVE SIGNS for iVB, HorzBrk, and VertApprAngle.

Required format:
[{
  "pitchType": "string from Pitch Type column",
  "usage": decimal (P% divided by 100, e.g. 13.3% = 0.133),
  "velocity": number from Vel,
  "spin": number from Spin,
  "iVB": number from iVB (KEEP NEGATIVE SIGN if present),
  "horzBrk": number from HorzBrk (KEEP NEGATIVE SIGN if present),
  "extension": number from Extension,
  "relHt": number from Rel Ht,
  "relSide": number from RelSide,
  "vaa": number from VertApprAngle (KEEP NEGATIVE SIGN),
  "strikePercent": number from Strike%,
  "zonePercent": number from InZone% (NOT CSW%, NOT InZoneWhiff%),
  "swgStrkPercent": number from SwStrk%,
  "whiffPercent": number from Whiff%,
  "chasePercent": number from Chase%,
  "zoneWhiffPercent": number from InZoneWhiff%,
  "groundBallPercent": number from Ground%,
  "flyBallPercent": number from Fly%
}]

Use null for missing/"-" values. Only include rows with numeric iVB and HorzBrk.
Return ONLY the JSON array, no other text.`
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
