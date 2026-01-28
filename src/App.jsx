import React, { useState, useCallback, useRef } from 'react';

const PITCH_COLORS = {
  'Fastball (4S)': '#E63946',
  'Fastball': '#E63946',
  'Four-Seam': '#E63946',
  '4-Seam': '#E63946',
  'Fastball (2S)': '#F4722B',
  'Fastball (2S) / Sinker': '#F4722B',
  'Sinker': '#F4722B',
  'Two-Seam': '#F4722B',
  '2-Seam': '#F4722B',
  'Cutter': '#8B4513',
  'Slider': '#22C55E',
  'Curveball': '#7DD3FC',
  'Curve': '#7DD3FC',
  'Change': '#16A34A',
  'Changeup': '#16A34A',
  'Splitter': '#A855F7',
  'Split': '#A855F7',
  'Sweeper': '#EAB308',
  'Slurve': '#1D3557',
  'Knuckle': '#6D6875',
  'Screwball': '#B5838D',
  'Unknown': '#888888'
};

const getPitchColor = (pitchType) => {
  for (const [key, color] of Object.entries(PITCH_COLORS)) {
    if (pitchType.toLowerCase().includes(key.toLowerCase()) || 
        key.toLowerCase().includes(pitchType.toLowerCase())) {
      return color;
    }
  }
  return '#888888';
};

const renamePitchType = (pitchType) => {
  if (pitchType === 'Fastball (4S)') return 'Four-Seam';
  if (pitchType === 'Fastball (2S) / Sinker') return 'Sinker';
  return pitchType;
};

export default function PitchShapeVisualizer() {
  const [pitchData, setPitchData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredPitch, setHoveredPitch] = useState(null);
  const [excludeBelow5, setExcludeBelow5] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const contentRef = useRef(null);

  const parseImageWithOCR = async (file) => {
    setIsProcessing(true);
    setError(null);
    
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const usageThreshold = excludeBelow5 ? 0.05 : 0.02;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64 }
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
      const text = data.content.map(item => item.text || '').join('');
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      const filtered = parsed.filter(p => p.usage >= usageThreshold && p.iVB !== null && p.horzBrk !== null);
      setPitchData(filtered);
    } catch (err) {
      setError('Failed to parse image. Please ensure it matches the expected format.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      parseImageWithOCR(file);
    }
  }, [excludeBelow5]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      parseImageWithOCR(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const downloadScreenshot = async () => {
    if (!contentRef.current) return;
    
    const html2canvas = (await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.esm.min.js')).default;
    const canvas = await html2canvas(contentRef.current, {
      backgroundColor: '#0f1419',
      scale: 2
    });
    
    const link = document.createElement('a');
    link.download = 'pitch-plot.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const plotSize = 480;
  const padding = 50;
  const innerSize = plotSize - padding * 2;
  const xRange = [-20, 20];
  const yRange = [-22, 22];

  // Theme colors
  const theme = darkMode ? {
    background: 'linear-gradient(135deg, #0f1419 0%, #1a2332 50%, #0d1117 100%)',
    containerBg: 'rgba(13, 17, 23, 0.9)',
    plotBg: '#0d1117',
    text: '#e6edf3',
    textMuted: '#8b949e',
    textDim: '#6e7681',
    border: '#30363d',
    borderLight: '#21262d',
    axisLine: '#484f58',
    gridLine: '#21262d',
    inputBg: 'rgba(22, 27, 34, 0.8)',
    uploadBg: 'rgba(22, 27, 34, 0.6)',
    buttonBg: 'rgba(48, 54, 61, 0.6)',
    tableBg: 'rgba(48, 54, 61, 0.6)',
    highlightBg: 'rgba(88, 166, 255, 0.15)'
  } : {
    background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 50%, #f0f0f0 100%)',
    containerBg: 'rgba(255, 255, 255, 0.95)',
    plotBg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#555555',
    textDim: '#777777',
    border: '#d0d0d0',
    borderLight: '#e5e5e5',
    axisLine: '#888888',
    gridLine: '#e0e0e0',
    inputBg: 'rgba(255, 255, 255, 0.9)',
    uploadBg: 'rgba(250, 250, 250, 0.8)',
    buttonBg: 'rgba(230, 230, 230, 0.8)',
    tableBg: 'rgba(240, 240, 240, 0.8)',
    highlightBg: 'rgba(88, 166, 255, 0.2)'
  };

  const scaleX = (val) => padding + ((val - xRange[0]) / (xRange[1] - xRange[0])) * innerSize;
  const scaleY = (val) => padding + ((yRange[1] - val) / (yRange[1] - yRange[0])) * innerSize;
  // Scale usage to circle radius (larger: min 20, max 38)
  const scaleRadius = (usage) => Math.max(20, Math.min(38, 18 + usage * 38));

  const roundSpin = (spin) => Math.round(spin / 100) * 100;
  const formatDecimal = (val, places) => val != null ? val.toFixed(places) : '-';
  const formatPercent = (val) => val != null ? `${Math.round(val)}%` : '-';

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.background,
      fontFamily: '"Work Sans", sans-serif',
      fontWeight: 600,
      color: theme.text,
      padding: '32px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap');
        
        * {
          font-family: 'Work Sans', sans-serif;
        }
        
        .upload-zone {
          border: 2px dashed ${theme.border};
          border-radius: 12px;
          padding: 48px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: ${theme.uploadBg};
        }
        .upload-zone:hover, .upload-zone.dragging {
          border-color: #58a6ff;
          background: rgba(88, 166, 255, 0.05);
        }
        .plot-container {
          background: ${theme.containerBg};
          border: 1px solid ${theme.border};
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, ${darkMode ? '0.4' : '0.1'});
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: ${theme.buttonBg};
          border-radius: 6px;
          font-size: 13px;
        }
        .grid-line {
          stroke: ${theme.gridLine};
          stroke-width: 1;
        }
        .axis-line {
          stroke: ${theme.axisLine};
          stroke-width: 2;
        }
        .axis-label {
          fill: ${theme.textMuted};
          font-size: 11px;
          font-family: 'Work Sans', sans-serif;
          font-weight: 600;
        }
        .title-text {
          fill: ${theme.text};
          font-size: 14px;
          font-weight: 700;
          font-family: 'Work Sans', sans-serif;
        }
        .pitch-circle {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .pitch-circle:hover {
          filter: brightness(1.3);
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          font-weight: 600;
          margin-top: 24px;
        }
        .data-table th {
          background: ${theme.tableBg};
          padding: 10px 8px;
          text-align: left;
          font-weight: 600;
          color: ${theme.textMuted};
          border-bottom: 1px solid ${theme.border};
          white-space: nowrap;
        }
        .data-table td {
          padding: 10px 8px;
          border-bottom: 1px solid ${theme.borderLight};
          transition: all 0.2s ease;
        }
        .data-table tr {
          transition: all 0.2s ease;
        }
        .data-table tr.highlighted {
          background: ${theme.highlightBg};
        }
        .data-table tr.dimmed {
          opacity: 0.4;
        }
        .toggle-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          justify-content: center;
        }
        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          background: ${theme.border};
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .toggle-switch.active {
          background: #58a6ff;
        }
        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: ${darkMode ? '#e6edf3' : '#ffffff'};
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .toggle-switch.active::after {
          transform: translateX(20px);
        }
        .download-btn {
          background: linear-gradient(135deg, #238636, #2ea043);
          border: none;
          border-radius: 8px;
          color: white;
          padding: 12px 24px;
          cursor: pointer;
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          margin-top: 24px;
          transition: all 0.2s;
        }
        .download-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(35, 134, 54, 0.4);
        }
        .theme-toggle-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid ${theme.border};
        }
      `}</style>

      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <header style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: '"Work Sans", sans-serif',
            fontSize: '28px',
            fontWeight: 700,
            margin: 0,
            background: 'linear-gradient(90deg, #58a6ff, #a371f7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Pitch Plot Creator
          </h1>
          <p style={{ color: theme.textMuted, marginTop: '8px', fontSize: '14px' }}>
            Drop a screenshot of data and a pitch plot will appear
          </p>
        </header>

        {!pitchData && (
          <>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <input
                type="text"
                placeholder="Enter player name (optional)"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                style={{
                  background: theme.inputBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  color: theme.text,
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  width: '280px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
            </div>
            
            <div className="toggle-container">
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>Exclude pitches below 5% usage</span>
              <div 
                className={`toggle-switch ${excludeBelow5 ? 'active' : ''}`}
                onClick={() => setExcludeBelow5(!excludeBelow5)}
              />
            </div>
            
            <div
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {isProcessing ? (
                <div>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #30363d',
                    borderTopColor: '#58a6ff',
                    borderRadius: '50%',
                    margin: '0 auto 16px',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <p style={{ color: theme.textMuted }}>Processing image...</p>
                </div>
              ) : (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="1.5" style={{ marginBottom: '16px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p style={{ fontSize: '16px', marginBottom: '8px' }}>
                    Drop your screenshot here or click to upload
                  </p>
                  <p style={{ color: theme.textDim, fontSize: '13px' }}>
                    Supports PNG, JPG, WebP
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {error && (
          <div style={{
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid #f85149',
            borderRadius: '8px',
            padding: '16px',
            marginTop: '16px',
            color: '#f85149'
          }}>
            {error}
          </div>
        )}

        {pitchData && (
          <>
            <div ref={contentRef} className="plot-container">
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px', position: 'relative' }}>
                <h2 style={{
                  fontFamily: '"Work Sans", sans-serif',
                  fontSize: '18px',
                  fontWeight: 700,
                  margin: 0,
                  textAlign: 'center'
                }}>
                  {playerName.trim() || 'Pitch Movement Profile'}
                </h2>
                <button
                  onClick={() => setPitchData(null)}
                  style={{
                    background: theme.buttonBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    color: theme.textMuted,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    position: 'absolute',
                    right: 0
                  }}
                >
                  Upload New
                </button>
              </div>

              <svg width={plotSize} height={plotSize} style={{ display: 'block', margin: '0 auto' }}>
                <rect x={padding} y={padding} width={innerSize} height={innerSize} fill={theme.plotBg} />
                
                {[-20, -15, -10, -5, 5, 10, 15, 20].map(v => (
                  <line key={`vgrid-${v}`} className="grid-line"
                    x1={scaleX(v)} y1={padding} x2={scaleX(v)} y2={plotSize - padding} />
                ))}
                {[-20, -15, -10, -5, 5, 10, 15, 20].map(v => (
                  <line key={`hgrid-${v}`} className="grid-line"
                    x1={padding} y1={scaleY(v)} x2={plotSize - padding} y2={scaleY(v)} />
                ))}
                
                {/* Axes */}
                <line className="axis-line" x1={scaleX(0)} y1={padding} x2={scaleX(0)} y2={plotSize - padding} />
                <line className="axis-line" x1={padding} y1={scaleY(0)} x2={plotSize - padding} y2={scaleY(0)} />
                
                {[-20, -10, 10, 20].map(v => (
                  <text key={`xlabel-${v}`} className="axis-label" x={scaleX(v)} y={plotSize - padding + 18} textAnchor="middle">{v}"</text>
                ))}
                {[-20, -10, 10, 20].map(v => (
                  <text key={`ylabel-${v}`} className="axis-label" x={padding - 8} y={scaleY(v) + 4} textAnchor="end">{v}"</text>
                ))}
                
                <text className="title-text" x={plotSize / 2} y={plotSize - 8} textAnchor="middle">Horizontal Break (in)</text>
                <text className="title-text" x={14} y={plotSize / 2} textAnchor="middle" transform={`rotate(-90, 14, ${plotSize / 2})`}>Induced Vertical Break (in)</text>
                
                {/* Pitch circles */}
                {pitchData.map((pitch, i) => {
                  const x = scaleX(pitch.horzBrk);
                  const y = scaleY(pitch.iVB);
                  const r = scaleRadius(pitch.usage);
                  const color = getPitchColor(pitch.pitchType);
                  const isHovered = hoveredPitch === pitch.pitchType;
                  const isDimmed = hoveredPitch && hoveredPitch !== pitch.pitchType;
                  
                  return (
                    <g 
                      key={i} 
                      className="pitch-circle"
                      onMouseEnter={() => setHoveredPitch(pitch.pitchType)}
                      onMouseLeave={() => setHoveredPitch(null)}
                      style={{ opacity: isDimmed ? 0.3 : 1 }}
                    >
                      <circle cx={x} cy={y} r={r} fill={color} fillOpacity={isHovered ? 0.4 : 0.25} stroke={color} strokeWidth={isHovered ? 3 : 2} />
                      <circle cx={x} cy={y} r={6} fill={color} />
                    </g>
                  );
                })}
              </svg>

              {/* Data Table */}
              <div style={{ overflowX: 'auto', marginTop: '32px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pitch Type</th>
                      <th>Usage</th>
                      <th>Velocity</th>
                      <th>Spin</th>
                      <th>iVB</th>
                      <th>HB</th>
                      <th>Ext</th>
                      <th>Rel Ht</th>
                      <th>VAA</th>
                      <th>Strike%</th>
                      <th>Zone%</th>
                      <th>SwgStrk%</th>
                      <th>Whiff%</th>
                      <th>Chase%</th>
                      <th>ZoneWhiff%</th>
                      <th>GroundBall%</th>
                      <th>FlyBall%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pitchData.map((pitch, i) => {
                      const isHighlighted = hoveredPitch === pitch.pitchType;
                      const isDimmed = hoveredPitch && hoveredPitch !== pitch.pitchType;
                      
                      return (
                        <tr 
                          key={i}
                          className={isHighlighted ? 'highlighted' : isDimmed ? 'dimmed' : ''}
                          onMouseEnter={() => setHoveredPitch(pitch.pitchType)}
                          onMouseLeave={() => setHoveredPitch(null)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: getPitchColor(pitch.pitchType),
                              flexShrink: 0
                            }} />
                            {renamePitchType(pitch.pitchType)}
                          </td>
                          <td>{Math.round(pitch.usage * 100)}%</td>
                          <td>{formatDecimal(pitch.velocity, 1)}</td>
                          <td>{pitch.spin != null ? roundSpin(pitch.spin) : '-'}</td>
                          <td>{formatDecimal(pitch.iVB, 1)}</td>
                          <td>{formatDecimal(pitch.horzBrk, 1)}</td>
                          <td>{formatDecimal(pitch.extension, 1)}</td>
                          <td>{formatDecimal(pitch.relHt, 1)}</td>
                          <td>{formatDecimal(pitch.vaa, 2)}</td>
                          <td>{formatPercent(pitch.strikePercent)}</td>
                          <td>{formatPercent(pitch.zonePercent)}</td>
                          <td>{formatPercent(pitch.swgStrkPercent)}</td>
                          <td>{formatPercent(pitch.whiffPercent)}</td>
                          <td>{formatPercent(pitch.chasePercent)}</td>
                          <td>{formatPercent(pitch.zoneWhiffPercent)}</td>
                          <td>{formatPercent(pitch.groundBallPercent)}</td>
                          <td>{formatPercent(pitch.flyBallPercent)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <button className="download-btn" onClick={downloadScreenshot}>
                Download Screenshot
              </button>
            </div>
            
            <div className="theme-toggle-container">
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>Light Mode</span>
              <div 
                className={`toggle-switch ${darkMode ? 'active' : ''}`}
                onClick={() => setDarkMode(!darkMode)}
              />
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>Dark Mode</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
