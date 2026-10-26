import type { Scene } from './scene';
import type { Mat4 } from './math';

/**
 * A deliberately small WebGL renderer for the stage: coloured triangles with simple two-sided lighting, and lines on
 * top. It uses only WebGL 1 calls (GLSL ES 1.00), which expo-gl supports on iOS and Android and browsers support on
 * the web. Drawing happens on demand (after a change), not every frame, to save battery at the range.
 */
export type GLContext = WebGLRenderingContext & { endFrameEXP?: () => void };

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uViewProj;
uniform vec3 uLight;
varying vec3 vColor;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
  // A zero normal marks unlit geometry (ground, markings, lines). Lit faces are shaded on both sides.
  float lit = step(0.5, length(aNormal));
  float d = abs(dot(aNormal, uLight));
  vColor = aColor * mix(1.0, 0.6 + 0.4 * d, lit);
}`;
const FRAGMENT = `
precision mediump float;
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;
/** Light from up, behind and to the side of a shooter facing downrange, so wall faces read differently. */
const LIGHT = (() => { const v = [0.35, 0.55, 0.76], l = Math.hypot(v[0], v[1], v[2]); return new Float32Array(v.map(x => x / l)); })();

export type Renderer = { setScene: (scene: Scene) => void; draw: (viewProj: Mat4, clear: [number, number, number]) => void; dispose: () => void };

export function createRenderer(gl: GLContext): Renderer {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('Could not create a shader.');
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader did not compile: ' + (gl.getShaderInfoLog(s) ?? ''));
    return s;
  };
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create a GL program.');
  const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GL program did not link: ' + (gl.getProgramInfoLog(program) ?? ''));
  const loc = { pos: gl.getAttribLocation(program, 'aPos'), normal: gl.getAttribLocation(program, 'aNormal'), color: gl.getAttribLocation(program, 'aColor'),
    viewProj: gl.getUniformLocation(program, 'uViewProj'), light: gl.getUniformLocation(program, 'uLight') };
  // expo-gl checks arguments only lightly (a bad one can crash natively), so refuse to start instead of guessing.
  if (loc.pos < 0 || loc.normal < 0 || loc.color < 0 || !loc.viewProj || !loc.light) throw new Error('GL program is missing an input.');
  const buffers = Array.from({ length: 5 }, () => gl.createBuffer());
  if (buffers.some(b => !b)) throw new Error('Could not create GL buffers.');
  const [triPos, triNormal, triColor, linePos, lineColor] = buffers;
  let triangles = 0, lines = 0;
  const upload = (buffer: WebGLBuffer | null, data: Float32Array) => { if (!data.length) return; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); };
  const attribute = (index: number, buffer: WebGLBuffer | null) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 0, 0);
  };
  return {
    setScene(scene) {
      upload(triPos, scene.triangles.positions); upload(triNormal, scene.triangles.normals); upload(triColor, scene.triangles.colors);
      upload(linePos, scene.lines.positions); upload(lineColor, scene.lines.colors);
      triangles = scene.triangles.count; lines = scene.lines.count;
    },
    draw(viewProj, clear) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(clear[0], clear[1], clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.viewProj, false, viewProj);
      gl.uniform3fv(loc.light, LIGHT);
      // Faces are pushed back a little so outlines drawn on them win the depth test.
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 2);
      attribute(loc.pos, triPos); attribute(loc.normal, triNormal); attribute(loc.color, triColor);
      if (triangles) gl.drawArrays(gl.TRIANGLES, 0, triangles);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disableVertexAttribArray(loc.normal); gl.vertexAttrib3f(loc.normal, 0, 0, 0);
      attribute(loc.pos, linePos); attribute(loc.color, lineColor);
      if (lines) gl.drawArrays(gl.LINES, 0, lines);
      gl.flush();
      gl.endFrameEXP?.();
    },
    dispose() {
      buffers.forEach(b => gl.deleteBuffer(b));
      gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    },
  };
}
