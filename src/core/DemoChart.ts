// DemoChart.swift :: DemoChart (via 1.txt Phase 1)

export function createDemoChartJSON(): string {
  const beat = (m: number, n = 0, d = 1): [number, number, number] => [m, n, d];
  const notes: Record<string, unknown>[] = [];

  for (let i = 0; i < 64; i++) { // DemoChart.swift :: DemoChart.write
    const x = 24 + ((i * 53) % 208); // DemoChart.swift :: DemoChart.write
    notes.push({ beat: beat(i), x, w: 48 }); // DemoChart.swift :: DemoChart.write
    if (i % 4 === 2) { // DemoChart.swift :: DemoChart.write
      notes.push({ beat: beat(i, 1, 2), x: 255 - x, w: 40 }); // DemoChart.swift :: DemoChart.write
    }
  }

  const segs = [
    { beat: beat(1), x: 40 },  // DemoChart.swift :: DemoChart.write
    { beat: beat(2), x: 100 }, // DemoChart.swift :: DemoChart.write
    { beat: beat(3), x: 60 },  // DemoChart.swift :: DemoChart.write
  ];
  for (let k = 0; k < 4; k++) { // DemoChart.swift :: DemoChart.write
    notes.push({ beat: beat(8 + k * 12), x: 60, w: 48, seg: segs }); // DemoChart.swift :: DemoChart.write
  }

  notes.push({ beat: beat(30), x: 128, w: 200, type: 4 }); // DemoChart.swift :: DemoChart.write

  const root = {
    meta: {
      mode: 5, // DemoChart.swift :: DemoChart.write
      version: 'Demo',
      creator: 'demo',
      background: '',
      song: { title: 'Demo Chart', artist: 'Demo', id: 0 }, // DemoChart.swift :: DemoChart.write
    },
    time: [
      { beat: beat(0), bpm: 150 },   // DemoChart.swift :: DemoChart.write
      { beat: beat(16), bpm: 180 },  // DemoChart.swift :: DemoChart.write
      { beat: beat(32), bpm: 120.5 },// DemoChart.swift :: DemoChart.write
      { beat: beat(48), bpm: 200 },  // DemoChart.swift :: DemoChart.write
    ],
    effect: [
      { beat: beat(0), scroll: 1.0 },  // DemoChart.swift :: DemoChart.write
      { beat: beat(8), scroll: 1.5 },  // DemoChart.swift :: DemoChart.write
      { beat: beat(24), scroll: 0.5 }, // DemoChart.swift :: DemoChart.write
      { beat: beat(40), jump: 500 },   // DemoChart.swift :: DemoChart.write
      { beat: beat(56), scroll: 1.0 }, // DemoChart.swift :: DemoChart.write
    ],
    note: notes,
  };

  return JSON.stringify(root);
}
