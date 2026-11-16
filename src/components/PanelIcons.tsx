// PanelIcons.swift + MoreMenuIcons.swift + MetaMenuIcons.swift + Renderers.swift :: ZoomButtonShape
import React from 'react';
import { SwiftColors } from '../state/EditorConstants';

export type PanelIconKind =
  | 'edit'
  | 'bpm'
  | 'meta'
  | 'setting'
  | 'back'
  | 'note'
  | 'wipe'
  | 'slide'
  | 'remove'
  | 'more'
  | 'speed'
  | 'divide'; // PanelIcons.swift :: PanelIconKind

function polysToSvgPath(polys: readonly (readonly number[])[]): string {
  // PanelIcons.swift :: PanelIconView.fillPolys
  const parts: string[] = [];
  for (const flat of polys) {
    if (flat.length < 6) continue;
    let d = `M ${flat[0]} ${flat[1]}`;
    for (let i = 2; i + 1 < flat.length; i += 2) {
      d += ` L ${flat[i]} ${flat[i + 1]}`;
    }
    d += ' Z';
    parts.push(d);
  }
  return parts.join(' ');
}

export const PanelIconData = {
  // PanelIcons.swift :: PanelIconData
  pencil: [
    [17.37, -0.92, 17, -0.91, 16.62, -1.16, 6.18, -14.25, 6.09, -14.69, 6.23, -14.94, 8.12, -16.45, 9.81, -17.39, 11.62, -17.89, 13.19, -17.95, 15.06, -17.53, 16.11, -17, 17.37, -15.85, 21.42, -10.69, 21.89, -9.56, 22.03, -8.44, 21.9, -6.56, 21.44, -5.21, 20.87, -4.24, 19.94, -3.06, 17.87, -1.22],
    [-20.94, 17.94, -21.63, 17.95, -21.94, 17.82, -22.03, 17.56, -21.93, 17.06, -17.36, 3.5, -16.94, 2.89, 3.68, -12.94, 4.31, -13.23, 4.83, -13.06, 15, -0.01, 15.16, 0.44, 15.04, 0.88, -5.94, 16.41, -8.69, 16.85, -11.75, 17.02, -13.75, 17.33, -16.75, 17.5, -18.81, 17.81],
    [-14.01, 12.5, -11.31, 12.32, -7.88, 11.84, 8.3, -0.12, 8.39, -0.44, 8.21, -0.87, 3.98, -6.31, 3.75, -6.45, 3.25, -6.45, 2.56, -5.99, -12.77, 5.69, -13.35, 6.63, -15.13, 12.13, -14.88, 12.49],
  ], // PanelIcons.swift :: PanelIconData.pencil
  metronome: [
    [12.72, 17.99, -12.66, 18, -13.16, 17.97, -13.41, 17.76, -13.4, 16.73, -13.07, 15.61, -12.4, 11.79, -11.06, 5.61, -6.89, -16.39, -6.56, -17.58, -6.28, -17.95, 4.22, -18, 4.84, -17.87, 5.17, -17.52, 13.41, 17.36, 13.28, 17.8],
    [7.92, 14.29, 8.35, 14.04, 8.4, 13.42, 2.35, -13.58, 2.06, -14.02, 1.59, -14.21, -2.59, -14.23, -3.16, -14.13, -3.5, -13.77, -3.8, -12.46, -8.39, 11.79, -8.63, 13.48, -8.59, 14.04, -8.09, 14.33, -4.28, 14.23, -3.94, 13.86, -3.37, 12.48, -2.59, 11.44, -0.91, -5.04, -0.49, -7.89, -0.28, -8.33, -0.12, -7.96, 0.33, -4.52, 2.18, 11.36, 2.91, 12.42, 3.54, 13.92, 3.78, 14.19, 4.34, 14.34],
  ], // PanelIcons.swift :: PanelIconData.metronome
  list: [
    [14.62, 17.97, -14.19, 17.99, -15, 17.88, -15.94, 17.55, -17.38, 16.53, -18.29, 15.15, -18.63, 13.53, -18.64, -13.6, -18.32, -15.32, -17.8, -16.29, -17.25, -16.9, -15.82, -17.84, -14.57, -17.99, 14.43, -17.99, 16.06, -17.82, 17.5, -16.83, 18.43, -15.38, 18.64, -14.16, 18.63, 14.09, 18.4, 15.15, 18, 15.95, 17.5, 16.57, 16.25, 17.5],
    [13.9, 13.65, 14.35, 13.28, 14.47, 12.65, 14.48, -13.04, 14.11, -13.72, 13.68, -13.89, -13.32, -13.89, -14.13, -13.65, -14.35, -12.97, -14.34, 12.53, -14.13, 13.46, -13.38, 13.69],
    [-5.13, -3.78, -6.57, -3.81, -6.89, -4.1, -6.92, -7.22, -6.82, -7.71, -6.63, -7.88, 6.18, -7.92, 6.81, -7.79, 7.02, -7.47, 7.1, -4.29, 6.99, -4.04, 6.68, -3.86],
    [6.56, 2.6, -6.63, 2.61, -6.93, 2.21, -6.87, -1.22, -6.69, -1.44, -6.44, -1.49, 6.68, -1.44, 6.97, -1.29, 7.07, -1.04, 7.09, 2.15, 6.95, 2.46],
    [6.62, 9.03, -6.63, 9.05, -6.83, 8.9, -6.91, 8.59, -6.91, 5.28, -6.75, 5.02, -6.38, 4.94, 6.75, 5.01, 6.99, 5.15, 7.1, 5.4, 7.07, 8.09, 7, 8.83],
  ], // PanelIcons.swift :: PanelIconData.list
  back: [
    [-0.35, -17.8, -16.8, -1.59, -17.41, -0.43, -17.41, 0.56, -17.1, 1.33, -0.89, 17.54, -0.12, 17.93, 2.57, 15.39, 2.64, 14.39, -8.5, 3.33, -8.81, 2.56, -8.5, 2.33, 17.4, 2.41, 17.86, 1.56, 17.86, -1.59, 17.32, -2.28, -8.65, -2.28, -8.88, -2.51, -8.81, -3.05, 2.8, -14.57, 2.57, -15.34, 0.11, -17.72],
  ], // PanelIcons.swift :: PanelIconData.back
  note: [
    [-21.87, -1.4, -21.87, 1.6, -21.25, 3.98, -20.25, 5.37, -18.87, 6.67, -16.26, 7.82, -15.57, 7.9, 16.09, 7.82, 18.78, 6.67, 20.09, 5.52, 21.16, 4.14, 21.85, 1.68, 21.85, -1.4, 21.01, -4.08, 18.55, -6.54, 16.47, -7.47, 15.09, -7.62, -16.26, -7.54, -18.87, -6.39, -20.41, -4.93, -21.33, -3.55],
    [-16.49, -0.63, -15.95, -1.63, -14.88, -2.09, 14.78, -2.09, 15.71, -1.86, 16.32, -1.32, 16.55, 0.53, 16.24, 1.68, 14.71, 2.37, -14.26, 2.37, -15.41, 2.22, -16.34, 1.6],
  ], // PanelIcons.swift :: PanelIconData.note
  wipe: [
    [-21.02, 0.26, -20.72, 1.26, -19.26, 3.25, -5.19, 3.33, -4.35, 3.71, 0.03, 7.09, 0.95, 6.86, 4.49, 3.94, 5.64, 3.33, 19.7, 3.25, 21.54, 0.56, 20.85, -0.9, 19.7, -2.28, 6.41, -2.51, 0.49, -7.04, -0.28, -6.89, -5.12, -2.97, -6.12, -2.43, -18.79, -2.36, -19.64, -1.97],
  ], // PanelIcons.swift :: PanelIconData.wipe
  slide: [
    [20.09, -15.3, 19.62, -15.61, 4.87, -15.53, -10.11, -8.46, -10.42, -8, -10.27, -7, -7.35, 0.76, -7.04, 2.37, -11.73, 7.29, -20.02, 15.2, -20.18, 15.89, -19.41, 16.12, 11.4, 15.97, 20.24, 3.37, 20.47, 2.6, 10.63, -7.16, 10.17, -8, 12.02, -9.62, 18.55, -14.15, 19.7, -14.69],
    [9.33, -12.31, 9.71, -11.92, 9.64, -11.69, 8.41, -10.85, 7.1, -9.16, 6.95, -7.93, 7.33, -6.39, 8.18, -5.16, 16.24, 2.91, 16.01, 3.91, 10.4, 11.97, 9.4, 12.74, -11.96, 12.67, -12.03, 11.97, -4.5, 4.6, -3.89, 3.37, -3.81, 1.45, -6.5, -5.85, -6.42, -6.54, -3.96, -7.93, -0.2, -9.69, 0.8, -9.92, 5.41, -12.23],
  ], // PanelIcons.swift :: PanelIconData.slide
  trash: [
    [-12.57, -9.96, -12.8, -9.35, -12.8, 14.16, -12.65, 15.24, -12.03, 16.55, -10.57, 17.93, -9.73, 18.16, 8.87, 18.16, 9.71, 17.85, 11.1, 16.47, 11.86, 13.86, 11.86, -9.35, 11.63, -9.89, 10.71, -10.27, -11.8, -10.27],
    [-15.26, -15.88, -15.18, -12.73, -13.95, -12.11, 13.02, -12.11, 13.63, -12.27, 14.17, -13.04, 14.17, -15.8, 13.94, -16.19, 13.4, -16.42, 7.02, -16.49, 4.79, -18.11, -5.19, -18.18, -6.35, -17.8, -7.88, -16.49, -14.26, -16.42, -15.11, -16.19],
  ], // PanelIcons.swift :: PanelIconData.trash
  more: [
    [15.86, -5.08, 14.01, -4.16, 12.48, -2.4, 11.94, -0.86, 11.94, 1.06, 12.71, 2.91, 13.94, 4.29, 16.47, 5.44, 18.55, 5.37, 19.7, 4.98, 20.85, 4.21, 22.01, 2.83, 22.62, 1.22, 22.62, -1.17, 22.31, -2.16, 21.54, -3.32, 19.7, -4.78, 18.09, -5.16],
    [-1.51, -5.08, -3.27, -4.24, -4.66, -2.78, -5.42, -1.01, -5.42, 1.22, -4.12, 3.68, -2.89, 4.67, -0.89, 5.44, 1.11, 5.37, 3.33, 4.29, 4.95, 2.29, 5.26, 0.99, 5.1, -1.63, 3.95, -3.55, 1.95, -4.93],
    [-18.49, -5.24, -20.64, -4.39, -22.1, -2.93, -22.71, -1.47, -22.71, 1.6, -21.87, 3.37, -20.1, 4.83, -18.33, 5.44, -16.57, 5.44, -14.8, 4.83, -12.8, 2.98, -12.03, 1.06, -12.11, -1.32, -12.8, -2.86, -14.65, -4.62, -16.49, -5.24],
  ], // PanelIcons.swift :: PanelIconData.more
  speed: [
    [-5.73, -2.75, -5.5, -1.22, -1.66, 8.54, -0.97, 9.31, 0.03, 9.85, 1.18, 9.85, 2.64, 8.93, 3.18, 8, 3.1, 6.31, -0.51, 2.16, -4.89, -2.29],
    [-14.41, -12.97, -17.56, -9.44, -19.95, -5.29, -21.25, -0.91, -21.48, 1.55, -21.25, 6.62, -20.18, 10.46, -18.72, 13.54, -17.1, 15.84, -15.72, 17.3, -14.88, 17.84, 14.48, 17.84, 15.24, 17.45, 16.32, 16.38, 18.39, 13.54, 20.32, 9.16, 21.16, 4.85, 21.16, 0.78, 20.32, -3.45, 19.24, -6.13, 16.63, -10.36, 13.55, -13.51, 10.1, -15.82, 7.33, -17.05, 4.26, -17.89, -1.04, -18.27, -5.35, -17.74, -8.96, -16.51, -11.42, -15.2],
    [-13.8, -6.21, -11.26, -9.13, -8.96, -10.9, -6.65, -12.13, -2.97, -13.28, 2.64, -13.28, 6.56, -12.05, 8.56, -10.98, 10.94, -9.13, 13.4, -6.37, 14.78, -3.98, 16.01, -0.22, 16.01, 5.85, 14.78, 9.62, 13.55, 11.77, 12.4, 12.92, -12.8, 12.92, -13.95, 11.61, -15.57, 8.46, -16.49, 4.24, -16.49, 1.4, -15.57, -2.83],
  ], // PanelIcons.swift :: PanelIconData.speed
  divide: [
    [-9.8, -18.24, -10.11, -17.78, -10.03, 17.57, -9.42, 17.95, 10.02, 17.88, 10.4, 17.42, 10.33, -18.01, 9.79, -18.39],
    [-6.12, -14.86, 6.49, -14.86, 7.02, -14.39, 7.1, 13.88, 6.64, 14.34, -5.89, 14.42, -6.65, 13.96, -6.58, 10.65, -6.04, 10.27, -3.04, 10.27, -2.58, 9.58, -2.58, 8.43, -2.97, 7.81, -6.12, 7.73, -6.58, 7.43, -6.58, 4.28, -5.96, 3.89, 1.95, 3.97, 2.49, 3.82, 2.8, 3.12, 2.72, 1.74, 2.34, 1.43, -6.04, 1.43, -6.65, 0.9, -6.5, -2.25, -5.96, -2.56, -3.27, -2.49, -2.74, -2.79, -2.58, -4.41, -2.89, -4.94, -5.96, -5.02, -6.65, -5.56, -6.5, -8.63, -6.12, -8.86, -3.12, -8.86, -2.58, -9.63, -2.58, -10.78, -2.97, -11.4, -5.89, -11.4, -6.58, -11.71, -6.65, -14.39],
  ], // PanelIcons.swift :: PanelIconData.divide
} as const;

function buildGearPath(): string {
  // PanelIcons.swift :: PanelIconView.drawGear
  const teeth = 8; // PanelIcons.swift :: drawGear
  const tip = 15.6; // PanelIcons.swift :: drawGear
  const root = 12.0; // PanelIcons.swift :: drawGear
  const tipHalf = 9.0; // PanelIcons.swift :: drawGear
  const rootHalf = 13.5; // PanelIcons.swift :: drawGear
  const step = 360.0 / teeth;
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180.0;
    return `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`;
  };
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const c0 = -90.0 + i * step;
    const a = pt(root, c0 - rootHalf);
    d += i === 0 ? `M ${a}` : ` L ${a}`;
    d += ` L ${pt(tip, c0 - tipHalf)}`;
    d += ` L ${pt(tip, c0 + tipHalf)}`;
    d += ` L ${pt(root, c0 + rootHalf)}`;
    const gap = step - rootHalf * 2;
    for (let k = 1; k <= 2; k++) {
      d += ` L ${pt(root, c0 + rootHalf + (gap * k) / 3.0)}`;
    }
  }
  return d + ' Z';
}

const GEAR_PATH = buildGearPath();

export const PanelIconView: React.FC<{ kind: PanelIconKind; color: string }> = ({ kind, color }) => {
  // PanelIcons.swift :: PanelIconView (frame width: 50, height: 36 + 6 = 42)
  if (kind === 'setting') {
    return (
      <svg width={50} height={42} viewBox="-25 -21 50 42" style={{ display: 'block', overflow: 'visible' }}>
        <path
          d={GEAR_PATH}
          fill="none"
          stroke={color}
          strokeWidth={3.8} // PanelIcons.swift :: drawGear
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={0}
          cy={0}
          r={5.2} // PanelIcons.swift :: drawGear (width: 10.4)
          fill="none"
          stroke={color}
          strokeWidth={3.8} // PanelIcons.swift :: drawGear
        />
      </svg>
    );
  }

  let polys: readonly (readonly number[])[];
  switch (kind) {
    case 'edit':
      polys = PanelIconData.pencil;
      break;
    case 'bpm':
      polys = PanelIconData.metronome;
      break;
    case 'meta':
      polys = PanelIconData.list;
      break;
    case 'back':
      polys = PanelIconData.back;
      break;
    case 'note':
      polys = PanelIconData.note;
      break;
    case 'wipe':
      polys = PanelIconData.wipe;
      break;
    case 'slide':
      polys = PanelIconData.slide;
      break;
    case 'remove':
      polys = PanelIconData.trash;
      break;
    case 'more':
      polys = PanelIconData.more;
      break;
    case 'speed':
      polys = PanelIconData.speed;
      break;
    case 'divide':
      polys = PanelIconData.divide;
      break;
  }

  return (
    <svg width={50} height={42} viewBox="-25 -21 50 42" style={{ display: 'block', overflow: 'visible' }}>
      <path d={polysToSvgPath(polys)} fill={color} fillRule="evenodd" />
    </svg>
  );
};

function buildOrderTwoArcPath(): string {
  // PanelIcons.swift :: OrderIcon
  const boxW = 19; // PanelIcons.swift :: OrderIcon
  const gap = 5; // PanelIcons.swift :: OrderIcon
  const x2 = (boxW + gap) / 2;
  const r = 4.2; // PanelIcons.swift :: OrderIcon
  const arcY = -3.3; // PanelIcons.swift :: OrderIcon
  let d = '';
  for (let deg = 190.0; deg <= 385.0; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const px = x2 + r * Math.cos(rad);
    const py = arcY + r * Math.sin(rad);
    d += deg === 190.0 ? `M ${px.toFixed(3)} ${py.toFixed(3)}` : ` L ${px.toFixed(3)} ${py.toFixed(3)}`;
  }
  d += ` L ${x2 - 4.2} 7.5 L ${x2 + 4.4} 7.5`; // PanelIcons.swift :: OrderIcon
  return d;
}

const ORDER_TWO_PATH = buildOrderTwoArcPath();

export const OrderIcon: React.FC<{ color: string }> = ({ color }) => {
  // PanelIcons.swift :: OrderIcon
  const boxW = 19; // PanelIcons.swift :: OrderIcon
  const boxH = 34; // PanelIcons.swift :: OrderIcon
  const gap = 5; // PanelIcons.swift :: OrderIcon
  const x1 = -(boxW + gap) / 2;
  const x2 = (boxW + gap) / 2;

  return (
    <svg width={50} height={42} viewBox="-25 -21 50 42" style={{ display: 'block', overflow: 'visible' }}>
      <rect
        x={x1 - boxW / 2}
        y={-boxH / 2}
        width={boxW}
        height={boxH}
        rx={4.5} // PanelIcons.swift :: OrderIcon
        fill="none"
        stroke={color}
        strokeWidth={3.2} // PanelIcons.swift :: OrderIcon
        strokeLinejoin="round"
      />
      <rect
        x={x2 - boxW / 2}
        y={-boxH / 2}
        width={boxW}
        height={boxH}
        rx={4.5} // PanelIcons.swift :: OrderIcon
        fill="none"
        stroke={color}
        strokeWidth={3.2} // PanelIcons.swift :: OrderIcon
        strokeLinejoin="round"
      />
      <path
        d={`M ${x1 - 3.4} -4.4 L ${x1 + 1.0} -7.5 L ${x1 + 1.0} 7.5`} // PanelIcons.swift :: OrderIcon
        fill="none"
        stroke={color}
        strokeWidth={2.6} // PanelIcons.swift :: OrderIcon
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={ORDER_TWO_PATH}
        fill="none"
        stroke={color}
        strokeWidth={2.6} // PanelIcons.swift :: OrderIcon
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const InfoIcon: React.FC<{ color: string }> = ({ color }) => (
  // MetaMenuIcons.swift :: InfoIcon (frame 42 x 36)
  <svg width={42} height={36} viewBox="-21 -18 42 36" style={{ display: 'block', overflow: 'visible' }}>
    <rect
      x={-16}
      y={-15}
      width={32}
      height={30}
      rx={7} // MetaMenuIcons.swift :: InfoIcon
      fill="none"
      stroke={color}
      strokeWidth={4} // MetaMenuIcons.swift :: InfoIcon
      strokeLinejoin="round"
    />
    <circle
      cx={0}
      cy={0}
      r={7.5} // MetaMenuIcons.swift :: InfoIcon
      fill="none"
      stroke={color}
      strokeWidth={3.4} // MetaMenuIcons.swift :: InfoIcon
    />
    <circle cx={0} cy={0} r={2.6} fill={color} />
  </svg>
);

function buildPowerArcPath(): string {
  // MetaMenuIcons.swift :: PowerIcon
  const cy = 2; // MetaMenuIcons.swift :: PowerIcon (size.height/2 + 2)
  const r = 12.5; // MetaMenuIcons.swift :: PowerIcon
  let d = '';
  for (let deg = -50.0; deg <= 230.0; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const px = r * Math.cos(rad);
    const py = cy + r * Math.sin(rad);
    d += deg === -50.0 ? `M ${px.toFixed(3)} ${py.toFixed(3)}` : ` L ${px.toFixed(3)} ${py.toFixed(3)}`;
  }
  return d;
}

const POWER_ARC_PATH = buildPowerArcPath();

export const PowerIcon: React.FC<{ color: string }> = ({ color }) => (
  // MetaMenuIcons.swift :: PowerIcon (frame 42 x 36)
  <svg width={42} height={36} viewBox="-21 -18 42 36" style={{ display: 'block', overflow: 'visible' }}>
    <path
      d={POWER_ARC_PATH}
      fill="none"
      stroke={color}
      strokeWidth={4} // MetaMenuIcons.swift :: PowerIcon
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1={0}
      y1={2 - 12.5 - 4} // MetaMenuIcons.swift :: PowerIcon (cy - r - 4)
      x2={0}
      y2={2 - 1} // MetaMenuIcons.swift :: PowerIcon (cy - 1)
      stroke={color}
      strokeWidth={4} // MetaMenuIcons.swift :: PowerIcon
      strokeLinecap="round"
    />
  </svg>
);

export const ReviewIcon: React.FC<{ color: string }> = ({ color }) => (
  // MetaMenuIcons.swift :: ReviewIcon (frame 42 x 36)
  <svg width={42} height={36} viewBox="-21 -18 42 36" style={{ display: 'block', overflow: 'visible' }}>
    <rect
      x={-15}
      y={-15}
      width={30}
      height={30}
      rx={6} // MetaMenuIcons.swift :: ReviewIcon
      fill="none"
      stroke={color}
      strokeWidth={4} // MetaMenuIcons.swift :: ReviewIcon
      strokeLinejoin="round"
    />
    <rect
      x={-5.5}
      y={-5.5}
      width={11}
      height={11}
      rx={2} // MetaMenuIcons.swift :: ReviewIcon
      fill="none"
      stroke={color}
      strokeWidth={3.4} // MetaMenuIcons.swift :: ReviewIcon
      strokeLinejoin="round"
    />
  </svg>
);

export type MoreMenuIconKind =
  | 'copy'
  | 'paste'
  | 'timeRange'
  | 'lasso'
  | 'flip'
  | 'grid'
  | 'slideModify'
  | 'slideToWipe'
  | 'wipeToSlide'; // MoreMenuIcons.swift :: MoreMenuIconKind

const MoreMenuIconData = {
  // MoreMenuIcons.swift :: MoreMenuIconData
  copy: [
    [-5.25, 7.5, 4, 7.5, 4, 9.75, -5.25, 9.75],
    [-5.25, 2.75, 4, 2.75, 4, 5, -5.25, 5],
    [-5.25, -1.75, 4, -1.75, 4, 0.5, -5.25, 0.5],
    [17.25, -16.5, 15.75, -17, -1, -17, -2, -16.25, -2.75, -15, -3, -14.5, -3, -10.5, -3.5, -10, -8.25, -10, -9.5, -9.5, -10.5, -8.75, -11, -7, -11, 14, -10.5, 15.25, -10, 16, -8, 17, -7.25, 16.75, 8.5, 16.5, 9.75, 16, 10.5, 15, 10.5, 14.25, 10.5, 10.5, 11, 9.75, 16.25, 9.5, 18, 8.5, 18.5, 7.75, 18.5, 7, 18.5, -14.25, 18.25, -15.5],
    [-7.5, -6.75, 6.75, -7, 7.5, -6.5, 7.5, 13, 7.25, 13.5, 6.5, 13.75, -7, 13.75, -7.5, 13.25, -7.75, -6.5],
    [0.5, -13.75, 15, -14, 15.25, -13.75, 15.5, -13.25, 15.5, 6, 15.25, 6.5, 14.75, 6.5, 11.25, 6.5, 10.75, 6, 10.5, -7.5, 10, -8.75, 9.25, -9.5, 8, -10, 0.5, -10, 0, -10.5, 0, -13],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.copy
  paste: [
    [-5, 7.5, 4, 7.5, 4, 9.75, -5, 9.75],
    [18.5, 3, 18.25, 2.75, 15.75, 3, 15.5, 3.25, 15.5, 5.75, 15.25, 6.25, 12.5, 6.25, 12, 6.5, 12, 6.75, 12, 9.25, 12.5, 9.25, 16.25, 9.25, 17.5, 8.75, 18.25, 8, 18.5, 7],
    [-5, 2.5, 4, 2.5, 4, 4.75, -5, 4.75],
    [-5, -2, 4, -2, 4, 0.25, -5, 0.25],
    [13.25, -12.25, 9.5, -12.25, 9.25, -12, 9.5, -11.25, 10.5, -10.5, 9.75, -9.75, 7.75, -10, -8.25, -10.25, -10, -9, -11, -7.5, -11, 12.75, -10.75, 14.25, -9.75, 15.75, -8.25, 16.75, 8.25, 16.5, 9.25, 16, 10, 15.5, 10.5, 14.25, 10.5, -7.75, 11, -8.5, 11.5, -9, 12, -9, 12.25, -8.25, 12.5, -8, 13, -8, 13.5, -8.25, 13.75, -8.75, 13.75, -11.5],
    [-7.5, -7, 6.75, -7, 7.5, -6.5, 7.5, 12.5, 7.25, 13.25, -7, 13.5, -7.5, 13, -7.75, -6.25],
    [3.75, -17, 3.5, -17, -0.25, -17, -1.75, -16.5, -2.5, -15.75, -3, -14.75, -3, -11.5, -2, -11.25, -0.5, -11.25, 0, -11.75, 0, -13.25, 0.5, -14, 3, -14, 3.75, -14.25, 4, -14.5],
    [11.5, -17, 11, -16.75, 11.25, -14.25, 12, -14, 15.25, -14, 15.5, -13.25, 15.75, -9.75, 18.25, -9.75, 18.5, -11.5, 18.5, -14.5, 18, -16.25, 17.25, -16.75, 16.25, -17],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.paste
  flip: [
    [0.5, 6, 3.25, 6, 3.25, 15.5, 0.5, 15.5],
    [0.5, -15, 3.25, -15, 3.25, -5.5, 0.5, -5.5],
    [18.25, -15.75, 3, -0.5, 3, 0.25, 18, 15.25, 18.5, 15, 18.5, 14.5, 18.5, -15.25],
    [-16.75, -16.75, -17, -16, -17, 16, -16.5, 16.25, -0.5, 0, -0.25, -0.5, -7.25, -7.5, -8.25, -8.75, -9, -9.25, -16.5, -16.75],
    [-12.5, -6.5, -12, -6.5, -6.25, -0.25, -6.5, 0, -8, 1.25, -8.5, 2.25, -12.25, 6, -12.75, 5.75, -13, 5.25, -13, -5.75],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.flip
  grid: [
    [9.75, 9.25, 15.5, 9.25, 15.5, 15, 9.75, 15],
    [-2, 8.5, 5.25, 8.5, 5.25, 15.75, -2, 15.75],
    [-16.5, 7.25, -7.5, 7.25, -7.5, 16.75, -16.5, 16.75],
    [10, -3, 15.5, -3, 15.5, 2.5, 10, 2.5],
    [-2, -3.75, 5.25, -3.75, 5.25, 3.5, -2, 3.5],
    [-16.5, -5, -7.5, -5, -7.5, 4.5, -16.5, 4.5],
    [9.5, -15.5, 15.75, -15.5, 15.75, -9.5, 9.5, -9.5],
    [-2.5, -16.5, 5.5, -16.5, 5.5, -8.75, -2.5, -8.75],
    [-16.75, -17.25, -7, -17.25, -7, -7.75, -16.75, -7.75],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.grid
  slideModify: [
    [11.25, 7.25, 10.75, 7.75, 10, 10, 10.75, 10.5, 12.75, 11.25, 13.25, 10.5, 14, 8.5, 12, 7.25],
    [13.25, 1.75, 12.25, 4, 12, 4.75, 12.5, 5.25, 15, 6, 15.25, 5.5, 16.25, 3, 15, 2.25],
    [-5.25, -1, -7, 0.75, -7, 1.5, -5.25, 3, -4.5, 3.25, -3, 1.5, -2.5, 0.5, -4.5, -1],
    [16.5, -3.5, 14.5, -2.25, 14, -1.5, 14.25, -0.5, 14.5, -0.25, 16.5, 0.5, 17, 0.5, 17.5, 0.5, 17.75, -0.25, 18, -1.75, 17.5, -3, 16.75, -3.5],
    [-3, -5.25, 0.5, -5.25, 0.5, -1.75, -3, -1.75],
    [13.75, -7.75, 12, -6.75, 11.25, -6, 11.5, -5.25, 13, -3.5, 13.5, -3.5, 15.5, -5, 15.5, -5.5, 14.5, -7.25],
    [11, -11.75, 10.5, -11.75, 8.5, -10, 8.5, -9.5, 9.75, -8, 10.25, -7.5, 12, -8.5, 12.75, -9.25, 12.5, -10],
    [8, -16.5, 7.5, -16.75, 0, -16.75, -3.5, -16.5, -3.5, -13.75, -2, -13, -1.5, -11.75, -2, -11, -2.75, -11, -3.25, -10.5, -3, -8, -2.5, -7.5, 0, -7.75, 0.5, -7.25, 2.75, -2.5, 3, -1.75, 2.5, -1.25, -5.75, 5, -6.5, 5, -8.5, 3.25, -9, 3.5, -10.75, 5.75, -10.5, 6, -9.25, 7.25, -9.25, 7.5, -10.5, 8.75, -11.25, 8.5, -12, 8, -12.5, 8, -14.25, 10, -14, 11.5, -16, 13, -17, 13.75, -17, 15, -16.25, 16, -15.5, 16.25, -9, 16.25, -8.25, 16.5, -7.25, 16.25, 9.25, 16.25, 10.75, 16.5, 11, 16.25, 12, 14, 12, 13.5, 9.25, 12.5, 8, 12.75, -9, 12.75, -9.25, 12.5, -6.75, 10.25, 4.5, 1.5, 6.75, -0.25, 7, -1, 6.75, -2, 2, -12.5, 1.75, -13, 2.25, -13.5, 5.5, -13.5, 6.25, -13, 7, -11.75, 8, -11.75, 9.5, -13, 10, -13.25, 9.75, -13.75],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.slideModify
  slideToWipe: [
    [3.75, 13.75, 15.5, 13.75, 15.5, 16.25, 3.75, 16.25],
    [3.75, 7.25, 15.5, 7.25, 15.5, 10, 3.75, 10],
    [3.5, 0.75, 15.75, 0.75, 15.75, 3.5, 3.5, 3.5],
    [3.75, -5.5, 15.5, -5.5, 15.5, -3, 3.75, -3],
    [-17, -7, -5, -7, -5, 17, -17, 17],
    [12.25, -12.75, 11.75, -13.5, 6.25, -17, 5.5, -16.75, 4.5, -16, 4.75, -15.5, 6.75, -14.25, 6.5, -13.75, -4.75, -13.75, -8.5, -14, -9.5, -13.75, -9.5, -13.25, -9.5, -12.25, -9.25, -12, -8.5, -11.75, 6.5, -12, 6.75, -11.75, 6.5, -11.25, 4.25, -9.75, 4.5, -9.25, 5.5, -8.5, 6.5, -8.75, 11.75, -12, 12.25, -12.5],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.slideToWipe
  wipeToSlide: [
    [-16.75, 12.75, -5.5, 12.75, -5.5, 15.5, -16.75, 15.5],
    [-16.75, 6.5, -5.5, 6.5, -5.5, 9.25, -16.75, 9.25],
    [-16.75, 0.5, -5.5, 0.5, -5.5, 3, -16.75, 3],
    [3.25, -5.75, 14.5, -5.75, 14.5, 17, 3.25, 17],
    [-16.75, -5.75, -5.5, -5.75, -5.5, -3, -16.75, -3],
    [11.25, -12.75, 10.5, -13.5, 6, -16.5, 5, -16.75, 4.25, -16, 4, -15.5, 6, -14, 6, -13.75, 5.75, -13.5, -8.25, -13.75, -9.5, -13.5, -9.75, -12.5, -9.5, -12, -8.25, -11.75, 5.5, -11.75, 6, -11.5, 5.75, -11.25, 3.75, -9.75, 3.75, -9.5, 4.25, -9, 5.5, -8.5, 10.75, -11.75, 11.25, -12.25],
  ], // MoreMenuIcons.swift :: MoreMenuIconData.wipeToSlide
} as const;

export const MoreMenuIcon: React.FC<{ kind: MoreMenuIconKind; color: string; rowHeight: number }> = ({
  kind,
  color,
  rowHeight,
}) => {
  // MoreMenuIcons.swift :: MoreMenuIcon (originX = 21.5, frame width 64)
  const originX = 21.5; // MoreMenuIcons.swift :: MoreMenuIcon.originX
  const halfH = rowHeight / 2;
  const viewBox = `${-originX} ${-halfH} 64 ${rowHeight}`;

  if (kind === 'timeRange') {
    const lw = 3.6; // MoreMenuIcons.swift :: MoreMenuIcon.drawTimeRange
    const half = 14.5 - lw / 2; // MoreMenuIcons.swift :: MoreMenuIcon.drawTimeRange
    return (
      <svg width={64} height={rowHeight} viewBox={viewBox} style={{ display: 'block', overflow: 'visible' }}>
        <rect
          x={-half}
          y={-half}
          width={half * 2}
          height={half * 2}
          rx={4} // MoreMenuIcons.swift :: drawTimeRange
          fill="none"
          stroke={color}
          strokeWidth={lw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 0 7.5 L 0 -7.5 M -6.5 -1 L 0 -7.5 L 6.5 -1" // MoreMenuIcons.swift :: drawTimeRange
          fill="none"
          stroke={color}
          strokeWidth={lw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === 'lasso') {
    const lw = 3.6; // MoreMenuIcons.swift :: MoreMenuIcon.drawLasso
    return (
      <svg width={64} height={rowHeight} viewBox={viewBox} style={{ display: 'block', overflow: 'visible' }}>
        <ellipse
          cx={0}
          cy={-13 + 8.5} // MoreMenuIcons.swift :: drawLasso (y: c.y - 13, height: 17)
          rx={13} // MoreMenuIcons.swift :: drawLasso (width: 26)
          ry={8.5} // MoreMenuIcons.swift :: drawLasso (height: 17)
          fill="none"
          stroke={color}
          strokeWidth={lw}
          strokeLinecap="round"
          strokeDasharray="4.4 3.4" // MoreMenuIcons.swift :: drawLasso
        />
        <path
          d="M -6.5 3.5 Q -11 9 -3 13" // MoreMenuIcons.swift :: drawLasso
          fill="none"
          stroke={color}
          strokeWidth={lw}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width={64} height={rowHeight} viewBox={viewBox} style={{ display: 'block', overflow: 'visible' }}>
      <path d={polysToSvgPath(MoreMenuIconData[kind])} fill={color} fillRule="evenodd" />
    </svg>
  );
};

export const ZoomButtonShapeSvg: React.FC<{
  fill: string;
  stroke: string;
  strokeWidth?: number;
}> = ({ fill, stroke, strokeWidth = 1.5 }) => (
  // Renderers.swift :: ZoomButtonShape (39 x 45)
  <svg width={39} height={45} viewBox="0 0 39 45" style={{ position: 'absolute', inset: 0, display: 'block' }}>
    <polygon
      points="0.5,0.75 24.65,0.75 37.7,22.5 24.65,44.25 0.5,44.25" // Renderers.swift :: ZoomButtonShape
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="miter"
    />
  </svg>
);

export const HexagonShapeSvg: React.FC<{
  width: number;
  height: number;
  fill: string;
  innerWidth?: number;
  innerHeight?: number;
  innerFill?: string;
}> = ({ width, height, fill, innerWidth, innerHeight, innerFill }) => {
  // PanelIcons.swift :: HexagonShape
  const hexPoints = (x0: number, y0: number, w: number, h: number): string => {
    const q = w * 0.25; // PanelIcons.swift :: HexagonShape (w * 0.25)
    const midY = y0 + h / 2;
    return `${x0},${midY} ${x0 + q},${y0} ${x0 + w - q},${y0} ${x0 + w},${midY} ${x0 + w - q},${y0 + h} ${x0 + q},${y0 + h}`;
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    >
      <polygon points={hexPoints(0, 0, width, height)} fill={fill} />
      {innerWidth !== undefined && innerHeight !== undefined && innerFill !== undefined && (
        <polygon
          points={hexPoints((width - innerWidth) / 2, (height - innerHeight) / 2, innerWidth, innerHeight)}
          fill={innerFill}
        />
      )}
    </svg>
  );
};

export const PlayGlyph: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  // PanelIcons.swift :: PlayGlyph (tint 0.955, outer ~32x28)
  const tint = SwiftColors.playGlyphTint; // PanelIcons.swift :: PlayGlyph.tint
  if (isPlaying) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {/* PanelIcons.swift :: PlayGlyph (spacing: 8, width: 9.5, height: 28, cornerRadius: 2.5) */}
        <div style={{ width: 9.5, height: 28, borderRadius: 2.5, backgroundColor: tint }} />
        <div style={{ width: 9.5, height: 28, borderRadius: 2.5, backgroundColor: tint }} />
      </div>
    );
  }
  return (
    <svg
      width={26}
      height={22}
      viewBox="0 0 26 22"
      style={{ display: 'block', overflow: 'visible', transform: 'translateX(1.7px)' }} // PanelIcons.swift :: PlayGlyph (frame 26x22, offset x: 1.7)
    >
      <polygon
        points="0,0 0,22 26,11" // PanelIcons.swift :: PlayTriangleShape
        fill={tint}
        stroke={tint}
        strokeWidth={6} // PanelIcons.swift :: PlayGlyph (lineWidth: 6)
        strokeLinejoin="round"
      />
    </svg>
  );
};
