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
    // PASS 1: Identify the exact column headers and their positions
    const pass1Response = await fetch('https://api.anthropic.com/v1/messages', {
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
              text: `Look at this baseball statistics table. I need you to identify the EXACT column headers in order from left to right.

List EVERY column header you see in the first/header row, numbered starting from 1. Be extremely precise - write exactly what each header says.

Format your response as a numbered list like:
1. Pitch Type - Ungrouped
2. P%
3. ERA
...and so on for ALL columns.

Only list the headers, nothing else.`
            }
          ]
        }]
      })
    });

    const pass1Data = await pass1Response.json();
    
    if (!pass1Response.ok) {
      return res.status(pass1Response.status).json({ error: pass1Data.error?.message || 'Pass 1 failed' });
    }

    const columnList = pass1Data.content.map(item => item.text || '').join('');
    
    // PASS 2: Extract data using the identified column positions
    const pass2Response = await fetch('https://api.anthropic.com/v1/messages', {
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
              text: `You previously identified these column headers in this table:

${columnList}

Now extract the data. For each pitch type row that has numeric data, read the value from EACH SPECIFIC COLUMN by its header name.

I need these specific columns mapped to these JSON fields:
- "pitchType": from the Pitch Type column
- "usage": from "P%" column (convert to decimal: 13.3% → 0.133)
- "velocity": from "Vel" column
- "spin": from "Spin" column
- "iVB": from "iVB" column (PRESERVE NEGATIVE SIGNS)
- "horzBrk": from "HorzBrk" column (PRESERVE NEGATIVE SIGNS)
- "extension": from "Extension" column
- "relHt": from "Rel Ht" column
- "relSide": from "RelSide" column
- "vaa": from "VertApprAngle" column (PRESERVE NEGATIVE SIGNS)
- "strikePercent": from "Strike%" column
- "zonePercent": from "InZone%" column (this is IN-ZONE RATE, NOT CSW%, NOT InZoneWhiff%)
- "swgStrkPercent": from "SwStrk%" column
- "whiffPercent": from "Whiff%" column
- "chasePercent": from "Chase%" column
- "zoneWhiffPercent": from "InZoneWhiff%" column
- "groundBallPercent": from "Ground%" column
- "flyBallPercent": from "Fly%" column

CRITICAL: 
- Find the EXACT column header first, then read the value directly below it for each row
- "InZone%" and "InZoneWhiff%" are DIFFERENT columns - check the header carefully
- "InZone%" is NOT "CSW%" - they are different columns
- Use null for missing or "-" values

Return ONLY a valid JSON array, no other text.`
            }
          ]
        }]
      })
    });

    const pass2Data = await pass2Response.json();
    
    if (!pass2Response.ok) {
      return res.status(pass2Response.status).json({ error: pass2Data.error?.message || 'Pass 2 failed' });
    }

    const text = pass2Data.content.map(item => item.text || '').join('');
    
    // Clean the response
    let cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
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
