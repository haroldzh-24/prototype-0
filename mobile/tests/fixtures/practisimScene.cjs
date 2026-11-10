// A synthetic Practisim-like render with a known camera: stands in for match book pages (which are not in the repo).
// Shared by the READ 3D DRAWING tests (practisimReader.test.cjs) and the printout photo tests (printoutPhoto.test.cjs).
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
const g = require('../../src/diagramImport/groundPlane.ts'), rd = require('../../src/diagramImport/practisimReader.ts');

// Camera: ground cells (x across, y toward the camera) -> image pixels, looking down the bay from behind the shooter.
const W = 800, H = 560, BAY = { left: 0, right: 30, back: 0, front: 26 };
const CAM = g.fromPoints([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 26 }, { x: 0, y: 26 }], [{ x: 230, y: 60 }, { x: 570, y: 60 }, { x: 770, y: 540 }, { x: 30, y: 540 }]);
const TARGETS = [{ x: 6, y: 5 }, { x: 15, y: 3 }, { x: 24, y: 6 }, { x: 9, y: 12 }, { x: 21, y: 11 }];
const AREA = [{ x: 11, y: 18 }, { x: 19, y: 18 }, { x: 19, y: 23 }, { x: 11, y: 23 }];
const WALLS = [[{ x: 12, y: 9 }, { x: 17, y: 9 }], [{ x: 4, y: 15 }, { x: 4, y: 20 }]];
function render() {
  const rgba = new Uint8ClampedArray(W * H * 4), inv = g.invert(CAM);
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = g.apply(inv, { x, y }), inBay = p && p.x >= BAY.left && p.x <= BAY.right && p.y >= BAY.back - 0 && p.y <= BAY.front + 10;
    let c = [150, 140, 40]; // berm
    if (inBay) {
      const fx = Math.abs(p.x - Math.round(p.x)), fy = Math.abs(p.y - Math.round(p.y));
      c = Math.min(fx, fy) < 0.035 ? [150, 245, 140] : [40, 230, 20];
      // Shooting area: red lines 0.08 cells wide on the ground.
      const [a, , c2] = [AREA[0], AREA[1], AREA[2]];
      const onEdge = (p.x >= a.x - 0.04 && p.x <= c2.x + 0.04 && p.y >= a.y - 0.04 && p.y <= c2.y + 0.04) && (Math.abs(p.x - a.x) < 0.04 || Math.abs(p.x - c2.x) < 0.04 || Math.abs(p.y - a.y) < 0.04 || Math.abs(p.y - c2.y) < 0.04);
      if (onEdge) c = [220, 30, 30];
    }
    put(x, y, c);
  }
  const line = (a, b, c, width = 1) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) + 1; for (let k = 0; k <= n; k++) for (let d = -width + 1; d < width; d++) put(a.x + (b.x - a.x) * k / n + d, a.y + (b.y - a.y) * k / n, c); };
  const scaleAt = p => rd.pixelsPerCell(CAM, p);
  // Walls: bottom edge on the ground, posts up, top bar.
  for (const [p, q] of WALLS) {
    const a = g.apply(CAM, p), b = g.apply(CAM, q), up = 1.6 * scaleAt(p);
    line(a, b, [10, 10, 10], 2); line(a, { x: a.x, y: a.y - up }, [10, 10, 10], 2); line(b, { x: b.x, y: b.y - up }, [10, 10, 10], 2); line({ x: a.x, y: a.y - up }, { x: b.x, y: b.y - up }, [10, 10, 10], 2);
  }
  // Targets: tan face on two grey legs.
  for (const t of TARGETS) {
    const f = g.apply(CAM, t), s = scaleAt(t), legs = 0.45 * s, fw = 0.5 * s, fh = 0.8 * s;
    line({ x: f.x - fw * 0.3, y: f.y }, { x: f.x - fw * 0.3, y: f.y - legs }, [120, 120, 120]); line({ x: f.x + fw * 0.3, y: f.y }, { x: f.x + fw * 0.3, y: f.y - legs }, [120, 120, 120]);
    for (let y = Math.round(f.y - legs - fh); y < f.y - legs; y++) for (let x = Math.round(f.x - fw / 2); x < f.x + fw / 2; x++) put(x, y, [215, 185, 130]);
  }
  return { width: W, height: H, rgba };
}
module.exports = { W, H, BAY, CAM, TARGETS, AREA, WALLS, render };
