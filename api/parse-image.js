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
  const googleCredsJson = process.env.GOOGLE_CLOUD_CREDENTIALS;
  
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }
  
  if (!googleCredsJson) {
    return res.status(500).json({ error: 'Google Cloud credentials not configured' });
  }

  try {
    // Parse Google credentials - handle escaped newlines
    let googleCreds;
    try {
      // First try direct parse
      googleCreds = JSON.parse(googleCredsJson);
    } catch (e) {
      // If that fails, try replacing escaped newlines
      const fixedJson = googleCredsJson.replace(/\\\\n/g, '\\n');
      googleCreds = JSON.parse(fixedJson);
    }
    
    // Ensure private key has proper newlines
    if (googleCreds.private_key) {
      googleCreds.private_key = googleCreds.private_key.replace(/\\n/g, '\n');
    }
    
    // Get Google access token using JWT
    const accessToken = await getGoogleAccessToken(googleCreds);
    
    // STEP 1: Use Google Cloud Vision to extract text from image
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }]
        })
      }
    );

    const visionData = await visionResponse.json();
    
    if (!visionResponse.ok) {
      console.error('Vision API error:', visionData);
      return res.status(500).json({ error: 'Google Vision API failed: ' + (visionData.error?.message || 'Unknown error') });
    }

    const extractedText = visionData.responses?.[0]?.fullTextAnnotation?.text || '';
    
    if (!extractedText) {
      return res.status(400).json({ error: 'No text found in image' });
    }

    // STEP 2: Use Claude to parse the extracted text into structured data
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
          content: `Here is raw text extracted from a baseball statistics table via OCR. Parse it into structured JSON.

RAW TEXT:
${extractedText}

This is a pitch statistics table. The columns typically appear in this order:
Pitch Type, P%, ERA, xFIP, SIERA, SO%-BB%, P, Vel, Spin, SpinEff, iVB, HorzBrk, Extension, Rel Ht, RelSide, VertApprAngle, VertRelAngle, RelTilt, BrkTilt, Strike%, InZone%, SwStrk%, Whiff%, Chase%, InZoneWhiff%, BIP, Ground%, Fly%

CRITICAL - Read these columns correctly:
- "InZone%" is zone rate (typically 40-60%) - NOT the same as InZoneWhiff%
- "SwStrk%" is swinging strike rate (typically 8-20%)
- "Whiff%" is whiff rate (typically 20-40%)
- "Chase%" is chase rate (typically 20-35%)
- "InZoneWhiff%" is in-zone whiff rate (typically 10-30%) - comes AFTER Chase%
- "Ground%" is ground ball rate (typically 30-55%) - comes AFTER BIP
- "Fly%" is fly ball rate (typically 20-40%) - comes AFTER Ground%

For EACH pitch type row, extract ALL of these fields:
{
  "pitchType": string (e.g., "Fastball (4S)", "Slider"),
  "usage": decimal from P% (54.7% = 0.547),
  "velocity": number from Vel,
  "spin": number from Spin,
  "iVB": number from iVB (KEEP NEGATIVE SIGNS),
  "horzBrk": number from HorzBrk (KEEP NEGATIVE SIGNS),
  "extension": number from Extension,
  "relHt": number from Rel Ht,
  "relSide": number from RelSide,
  "vaa": number from VertApprAngle (KEEP NEGATIVE SIGNS),
  "strikePercent": number from Strike%,
  "zonePercent": number from InZone%,
  "swgStrkPercent": number from SwStrk%,
  "whiffPercent": number from Whiff%,
  "chasePercent": number from Chase%,
  "zoneWhiffPercent": number from InZoneWhiff%,
  "groundBallPercent": number from Ground%,
  "flyBallPercent": number from Fly%
}

IMPORTANT:
- Extract ALL fields for EVERY pitch row - do not skip any fields
- If a value appears as "-" or is missing, use null
- Percentages should be numbers only (32% becomes 32, not "32%")
- PRESERVE negative signs for iVB, HorzBrk, and vaa
- Only include rows that have numeric iVB and HorzBrk values

Return ONLY a valid JSON array with no explanation.`
        }]
      })
    });

    const claudeData = await claudeResponse.json();
    
    if (!claudeResponse.ok) {
      return res.status(claudeResponse.status).json({ error: claudeData.error?.message || 'Claude API failed' });
    }

    const text = claudeData.content.map(item => item.text || '').join('');
    
    // Clean and parse JSON
    let cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in Claude response:', text);
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

// Generate Google access token from service account credentials
async function getGoogleAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;
  
  // Create JWT header and claim
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry
  };
  
  // Base64url encode
  const base64url = (obj) => {
    const json = JSON.stringify(obj);
    const base64 = Buffer.from(json).toString('base64');
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };
  
  const headerEncoded = base64url(header);
  const claimEncoded = base64url(claim);
  const signatureInput = `${headerEncoded}.${claimEncoded}`;
  
  // Sign with private key
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(creds.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const jwt = `${signatureInput}.${signature}`;
  
  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  const tokenData = await tokenResponse.json();
  
  if (!tokenResponse.ok) {
    throw new Error('Failed to get Google access token: ' + (tokenData.error_description || tokenData.error));
  }
  
  return tokenData.access_token;
}
