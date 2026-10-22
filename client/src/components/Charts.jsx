import { useState } from 'react';

// Lightweight SVG charts (no chart library installed). Single series each, one y-axis, recessive grid,
// hover tooltip, and a screen-reader table so the data never depends on seeing the chart.
const W = 640, H = 240, L = 36, R = 12, T = 12, B = 28;

// Axis top = 4 equal whole-number steps (1/2/5 x 10^k each), so every gridline label is an exact integer.
function niceMax(v) {
  if (v <= 4) return 4;
  const x = v / 4, p = 10 ** Math.floor(Math.log10(x)), n = x / p;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p) * 4;
}

function Frame({ max, labels, xOf, every = 1, children }) {
  const ticks = [0, .25, .5, .75, 1].map(f => Math.round(max * f));
  const y = v => T + (H - T - B) * (1 - v / max);
  return (<>
    {ticks.map(t => (
      <g key={t}><line className="grid-line" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text className="axis-text" x={L - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>
    ))}
    {labels.map((l, i) => (labels.length - 1 - i) % every === 0 && <text key={i} className="axis-text" x={xOf(i)} y={H - 8} textAnchor="middle">{l}</text>)}
    {children(y)}
  </>);
}

function SrTable({ caption, data, valueName }) {
  return (
    // sr-only goes on a div: tables ignore height/overflow, so a hidden <table> would still take up page height.
    <div className="sr-only"><table><caption>{caption}</caption>
      <thead><tr><th>Label</th><th>{valueName}</th></tr></thead>
      <tbody>{data.map((d, i) => <tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody>
    </table></div>
  );
}

export function AreaChart({ data, caption, valueName = 'Value' }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const step = (W - L - R) / Math.max(1, data.length - 1), xOf = i => L + i * step;
  const pick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round((x - L) / step))));
  };
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={pick} aria-hidden="true">
        <defs><linearGradient id="qrAreaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart)" stopOpacity=".38" /><stop offset="1" stopColor="var(--chart)" stopOpacity="0" />
        </linearGradient></defs>
        <Frame max={max} labels={data.map(d => d.label)} xOf={xOf} every={data.length > 8 ? 2 : 1}>{y => {
          const pts = data.map((d, i) => [xOf(i), y(d.value)]);
          const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          return (<>
            <path className="area" d={line + ` L${xOf(data.length - 1)} ${y(0)} L${L} ${y(0)} Z`} />
            <path className="line" d={line} />
            {hover !== null && <line className="cross" x1={xOf(hover)} x2={xOf(hover)} y1={T} y2={y(0)} />}
            {hover !== null && <circle className="dot" cx={pts[hover][0]} cy={pts[hover][1]} r="5" />}
          </>);
        }}</Frame>
      </svg>
      {hover !== null && (() => {
        const d = data[hover];
        return <div className="chart-tip" style={{ left: xOf(hover) / W * 100 + '%', top: (T + (H - T - B) * (1 - d.value / max)) / H * 100 + '%' }}><b>{d.value} {valueName.toLowerCase()}</b>{d.tip || d.label}</div>;
      })()}
      <SrTable caption={caption} data={data} valueName={valueName} />
    </div>
  );
}

export function BarChart({ data, caption, valueName = 'Value' }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const slot = (W - L - R) / data.length, bw = Math.min(64, slot * .55), xOf = i => L + slot * i + slot / 2;
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <Frame max={max} labels={data.map(d => d.label)} xOf={xOf}>{y => data.map((d, i) => {
          const top = y(d.value), h = y(0) - top, r = Math.min(4, h);
          // Rounded top corners, square base anchored to the baseline.
          const path = h <= 0 ? '' : `M${xOf(i) - bw / 2} ${y(0)} V${top + r} Q${xOf(i) - bw / 2} ${top} ${xOf(i) - bw / 2 + r} ${top} H${xOf(i) + bw / 2 - r} Q${xOf(i) + bw / 2} ${top} ${xOf(i) + bw / 2} ${top + r} V${y(0)} Z`;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={L + slot * i} y={T} width={slot} height={y(0) - T} fill="transparent" />
              {path && <path className={'barrect' + (hover !== null && hover !== i ? ' dim' : '')} d={path} />}
            </g>
          );
        })}</Frame>
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: xOf(hover) / W * 100 + '%', top: (T + (H - T - B) * (1 - data[hover].value / max)) / H * 100 + '%' }}>
          <b>{data[hover].value} {valueName.toLowerCase()}</b>{data[hover].tip || data[hover].label}
        </div>
      )}
      <SrTable caption={caption} data={data} valueName={valueName} />
    </div>
  );
}
