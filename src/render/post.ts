/**
 * The look (WebGL2 post-processing): pixel art stays crisp, everything around it gets the soft,
 * expensive treatment, at the screen's own resolution:
 *  - the ground, drawn at art resolution, is blurred by depth (tilt-shift: the further past your knight
 *    the softer, the bottom edge a little), while everything standing stays sharp;
 *  - light is a smooth light map (sampled with linear filtering) that can push past white, so torches
 *    and lava really glow; emissive things (fire, magic, sparks) are added after the light;
 *  - bloom: the brightest parts are blurred at quarter resolution and added back;
 *  - height haze with drifting noise (fog that thickens toward the top of the view), soft light shafts
 *    outdoors, a color grade (shadows pushed cool, highlights warm, a little extra saturation), a
 *    smooth vignette and a whisper of film grain;
 *  - the rewind tint, flashes and fades; the HUD layer (health bars, numbers) goes on last, ungraded.
 * Layers come in as art-resolution canvases; `scale` is the whole number of screen pixels per art pixel.
 */

export interface PostLayers {
  ground: HTMLCanvasElement;
  stand: HTMLCanvasElement;
  emit: HTMLCanvasElement;
  light: HTMLCanvasElement;
  ui: HTMLCanvasElement;
}

export interface PostParams {
  time: number;
  /** Art size of the layers and screen pixels per art pixel. */
  artW: number;
  artH: number;
  scale: number;
  /** The camera's remainder below a whole art pixel (0..1): the layers slide by it, so scrolling is smooth. */
  offX?: number;
  offY?: number;
  /** Where the leader is, 0 (top) to 1 (bottom) of the screen; and how strong the depth blur is (0 off). */
  focusY: number;
  dof: number;
  /** Fog: color, amount (0..1), and how much it climbs toward the top of the view. */
  haze: [number, number, number];
  hazeAmount: number;
  /** Light shafts (0 off) and their color. */
  rays: number;
  rayColor: [number, number, number];
  /** Grade: shadow tint, highlight tint, saturation (1 = as is), contrast (1 = as is). */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
  bloom: number;
  flash: number;
  fade: number;
  rewind: number;
}

const VERT = `#version 300 es
in vec2 a;
out vec2 v_uv;
void main() {
  v_uv = a * 0.5 + 0.5;
  gl_Position = vec4(a, 0.0, 1.0);
}`;

// Separable gaussian blur (9 taps with linear-sampling offsets); dir is in source texels.
const BLUR = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_flipSrc;
void main() {
  vec2 uv = vec2(v_uv.x, mix(v_uv.y, 1.0 - v_uv.y, u_flipSrc));
  vec4 c = texture(u_src, uv) * 0.2270270270;
  c += texture(u_src, uv + u_dir * 1.3846153846) * 0.3162162162;
  c += texture(u_src, uv - u_dir * 1.3846153846) * 0.3162162162;
  c += texture(u_src, uv + u_dir * 3.2307692308) * 0.0702702703;
  c += texture(u_src, uv - u_dir * 3.2307692308) * 0.0702702703;
  o = c;
}`;

// Bright pass at quarter resolution (keeps what's brighter than the threshold).
const BRIGHT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(0.78, 1.25, l);
  o = vec4(c * k, 1.0);
}`;

// The composite: ground (sharp and blurred by depth), the standing layer, the light map, haze and rays.
const COMPOSITE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_ground;
uniform sampler2D u_groundBlur;
uniform sampler2D u_stand;
uniform sampler2D u_emit;
uniform sampler2D u_light;
uniform vec2 u_artScale;
uniform vec2 u_artOff;
uniform float u_focus;
uniform float u_dof;
uniform vec3 u_haze;
uniform float u_hazeAmount;
uniform float u_rays;
uniform vec3 u_rayColor;
uniform float u_time;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 s = vec2(v_uv.x, 1.0 - v_uv.y);        // screen, top-down
  vec2 a = s * u_artScale + u_artOff;          // art layers (canvas textures, top-down), slid sub-pixel
  // Depth of field on the ground.
  float y = s.y;
  float far = clamp((u_focus - 0.16 - y) / max(0.12, u_focus - 0.16), 0.0, 1.0);
  float edge = clamp((y - 0.9) / 0.1, 0.0, 1.0) * 0.55;
  float dof = clamp(max(far * far * 1.2, edge), 0.0, 1.0) * u_dof;
  vec3 g = mix(texture(u_ground, a).rgb, texture(u_groundBlur, vec2(a.x, 1.0 - a.y)).rgb, dof);
  vec4 st = texture(u_stand, a);
  vec3 c = mix(g, st.rgb, st.a);
  // Light: the map is stored at half strength so it can reach 2x (over-bright glows).
  vec3 L = texture(u_light, a).rgb * 2.0;
  c *= L;
  // Emissive things glow on top of the light.
  vec4 em = texture(u_emit, a);
  c = mix(c, em.rgb * 1.15, em.a);
  // Haze: thicker toward the top of the view, drifting.
  float n = noise(vec2(s.x * 5.0 + u_time * 0.05, s.y * 3.0 - u_time * 0.02)) * 0.6 + noise(vec2(s.x * 11.0 - u_time * 0.08, s.y * 7.0)) * 0.4;
  float h = u_hazeAmount * (0.35 + 0.65 * (1.0 - y)) * (0.55 + 0.6 * n);
  c = mix(c, u_haze, clamp(h, 0.0, 0.85));
  // Light shafts slanting down from the top left.
  if (u_rays > 0.0) {
    float d = s.x * 0.8 + s.y * 0.55;
    float r = pow(0.5 + 0.5 * sin(d * 23.0 + u_time * 0.35), 6.0) * 0.6 + pow(0.5 + 0.5 * sin(d * 9.0 - u_time * 0.22 + 1.3), 8.0) * 0.4;
    r *= smoothstep(1.05, 0.0, y) * (0.6 + 0.4 * noise(vec2(d * 6.0, u_time * 0.1)));
    c += u_rayColor * r * u_rays;
  }
  o = vec4(c, 1.0);
}`;

// The final pass: bloom added, the grade, the vignette, grain, rewind, flash and fade, then the HUD.
const FINAL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_lit;
uniform sampler2D u_bloom;
uniform sampler2D u_ui;
uniform vec2 u_artScale;
uniform vec2 u_artOff;
uniform float u_bloomAmt;
uniform vec3 u_shadowTint;
uniform vec3 u_highlightTint;
uniform float u_sat;
uniform float u_contrast;
uniform float u_vignette;
uniform float u_time;
uniform float u_flash;
uniform float u_fade;
uniform float u_rewind;
uniform vec2 u_res;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 c = texture(u_lit, v_uv).rgb;
  vec3 b = texture(u_bloom, v_uv).rgb;
  c += b * u_bloomAmt;
  // Filmic shoulder so the glows roll off instead of clipping.
  c = c / (1.0 + max(vec3(0.0), c - 0.8) * 0.9);
  // Grade: split toning by luminance, saturation, contrast.
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c *= mix(u_shadowTint, u_highlightTint, smoothstep(0.1, 0.75, l));
  l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, u_sat);
  c = (c - 0.5) * u_contrast + 0.5;
  // Vignette.
  vec2 d = v_uv - 0.5;
  d.x *= u_res.x / u_res.y;
  float v = smoothstep(0.95, 0.25, length(d) * (0.9 + u_vignette * 0.35));
  c *= mix(1.0 - u_vignette * 0.85, 1.0, v);
  // Rewind: cold, washed, with rolling scanlines.
  if (u_rewind > 0.0) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 cold = vec3(0.35, 0.55, 1.0) * (lum * 1.3 + 0.1);
    float scan = 0.82 + 0.18 * step(0.5, fract(gl_FragCoord.y / 6.0 + u_time * 8.0));
    c = mix(c, cold * scan, u_rewind * 0.85);
  }
  // Grain.
  c += (hash(gl_FragCoord.xy + fract(u_time * 37.0) * 100.0) - 0.5) * 0.025;
  c += u_flash;
  c *= 1.0 - u_fade;
  // The HUD layer (bars, numbers): crisp and ungraded.
  vec2 s = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 ui = texture(u_ui, s * u_artScale + u_artOff);
  c = mix(c, ui.rgb, ui.a * (1.0 - u_fade));
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class Post {
  readonly ok: boolean;
  private gl: WebGL2RenderingContext | null;
  private progs: Record<'blur' | 'bright' | 'composite' | 'final', WebGLProgram> | null = null;
  private tex: Record<keyof PostLayers, WebGLTexture> | null = null;
  private nearest: WebGLSampler | null = null;
  private linear: WebGLSampler | null = null;
  private targets: Record<'lit' | 'dofA' | 'dofB' | 'bloomA' | 'bloomB', Target> | null = null;
  private w = 0;
  private h = 0;
  private vao: WebGLVertexArrayObject | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    } catch {
      gl = null;
    }
    this.gl = gl;
    this.ok = !!gl && this.init();
  }

  private compile(vs: string, fs: string): WebGLProgram {
    const gl = this.gl!;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  private init(): boolean {
    const gl = this.gl!;
    try {
      this.progs = {
        blur: this.compile(VERT, BLUR),
        bright: this.compile(VERT, BRIGHT),
        composite: this.compile(VERT, COMPOSITE),
        final: this.compile(VERT, FINAL),
      };
    } catch (e) {
      console.warn('Post: shaders failed, using the canvas path', e);
      return false;
    }
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const mkTex = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    this.tex = { ground: mkTex(), stand: mkTex(), emit: mkTex(), light: mkTex(), ui: mkTex() };
    this.nearest = gl.createSampler()!;
    gl.samplerParameteri(this.nearest, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.nearest, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.nearest, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.nearest, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.linear = gl.createSampler()!;
    gl.samplerParameteri(this.linear, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.linear, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.linear, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.linear, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  private ensureTargets(w: number, h: number): void {
    if (this.targets && this.w === w && this.h === h) return;
    const gl = this.gl!;
    if (this.targets) {
      for (const t of Object.values(this.targets)) {
        gl.deleteFramebuffer(t.fb);
        gl.deleteTexture(t.tex);
      }
    }
    this.w = w;
    this.h = h;
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    const qw = Math.max(1, Math.ceil(w / 4));
    const qh = Math.max(1, Math.ceil(h / 4));
    this.targets = {
      lit: this.target(w, h),
      dofA: this.target(hw, hh),
      dofB: this.target(hw, hh),
      bloomA: this.target(qw, qh),
      bloomB: this.target(qw, qh),
    };
  }

  private upload(name: keyof PostLayers, c: HTMLCanvasElement): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex![name]);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  private bind(unit: number, tex: WebGLTexture, sampler: WebGLSampler, prog: WebGLProgram, name: string): void {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindSampler(unit, sampler);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  private pass(prog: WebGLProgram, target: Target | null): void {
    const gl = this.gl!;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
  }

  private blur(src: WebGLTexture, srcW: number, _srcH: number, flipSrc: boolean, a: Target, b: Target, radius: number): void {
    const gl = this.gl!;
    const p = this.progs!.blur;
    this.pass(p, a);
    this.bind(0, src, this.linear!, p, 'u_src');
    gl.uniform2f(gl.getUniformLocation(p, 'u_dir'), radius / srcW, 0);
    gl.uniform1f(gl.getUniformLocation(p, 'u_flipSrc'), flipSrc ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.pass(p, b);
    this.bind(0, a.tex, this.linear!, p, 'u_src');
    gl.uniform2f(gl.getUniformLocation(p, 'u_dir'), 0, radius / a.h);
    gl.uniform1f(gl.getUniformLocation(p, 'u_flipSrc'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(layers: PostLayers, p: PostParams): void {
    const gl = this.gl;
    if (!gl || !this.ok) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.ensureTargets(W, H);
    gl.bindVertexArray(this.vao);
    for (const k of Object.keys(layers) as Array<keyof PostLayers>) this.upload(k, layers[k]);
    const t = this.targets!;
    const artScale: [number, number] = [W / (p.artW * p.scale), H / (p.artH * p.scale)];
    const artOff: [number, number] = [(p.offX ?? 0) / p.artW, (p.offY ?? 0) / p.artH];
    // 1. The ground blurred (for depth of field), at half resolution. Canvas textures are top-down.
    const blurPx = Math.max(1, p.scale * 0.9);
    this.blur(this.tex!.ground, p.artW * p.scale * 0.5, p.artH * p.scale * 0.5, true, t.dofA, t.dofB, blurPx * 0.5);
    // The blurred copy covers the whole texture (bottom-up), so the composite samples it through the
    // same crop and slide as the sharp layers.
    // 2. Composite.
    const c = this.progs!.composite;
    this.pass(c, t.lit);
    this.bind(0, this.tex!.ground, this.nearest!, c, 'u_ground');
    this.bind(1, t.dofB.tex, this.linear!, c, 'u_groundBlur');
    this.bind(2, this.tex!.stand, this.nearest!, c, 'u_stand');
    this.bind(3, this.tex!.emit, this.nearest!, c, 'u_emit');
    this.bind(4, this.tex!.light, this.linear!, c, 'u_light');
    gl.uniform2f(gl.getUniformLocation(c, 'u_artScale'), artScale[0], artScale[1]);
    gl.uniform2f(gl.getUniformLocation(c, 'u_artOff'), artOff[0], artOff[1]);
    gl.uniform1f(gl.getUniformLocation(c, 'u_focus'), p.focusY);
    gl.uniform1f(gl.getUniformLocation(c, 'u_dof'), p.dof);
    gl.uniform3f(gl.getUniformLocation(c, 'u_haze'), ...p.haze);
    gl.uniform1f(gl.getUniformLocation(c, 'u_hazeAmount'), p.hazeAmount);
    gl.uniform1f(gl.getUniformLocation(c, 'u_rays'), p.rays);
    gl.uniform3f(gl.getUniformLocation(c, 'u_rayColor'), ...p.rayColor);
    gl.uniform1f(gl.getUniformLocation(c, 'u_time'), p.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. Bloom: bright pass at quarter resolution, then a wide blur, twice.
    const br = this.progs!.bright;
    this.pass(br, t.bloomA);
    this.bind(0, t.lit.tex, this.linear!, br, 'u_src');
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.blur(t.bloomA.tex, t.bloomA.w, t.bloomA.h, false, t.bloomB, t.bloomA, 1.5);
    this.blur(t.bloomA.tex, t.bloomA.w, t.bloomA.h, false, t.bloomB, t.bloomA, 3);
    // 4. Final.
    const f = this.progs!.final;
    this.pass(f, null);
    this.bind(0, t.lit.tex, this.linear!, f, 'u_lit');
    this.bind(1, t.bloomA.tex, this.linear!, f, 'u_bloom');
    this.bind(2, this.tex!.ui, this.nearest!, f, 'u_ui');
    gl.uniform2f(gl.getUniformLocation(f, 'u_artScale'), artScale[0], artScale[1]);
    gl.uniform2f(gl.getUniformLocation(f, 'u_artOff'), artOff[0], artOff[1]);
    gl.uniform1f(gl.getUniformLocation(f, 'u_bloomAmt'), p.bloom);
    gl.uniform3f(gl.getUniformLocation(f, 'u_shadowTint'), ...p.shadowTint);
    gl.uniform3f(gl.getUniformLocation(f, 'u_highlightTint'), ...p.highlightTint);
    gl.uniform1f(gl.getUniformLocation(f, 'u_sat'), p.saturation);
    gl.uniform1f(gl.getUniformLocation(f, 'u_contrast'), p.contrast);
    gl.uniform1f(gl.getUniformLocation(f, 'u_vignette'), p.vignette);
    gl.uniform1f(gl.getUniformLocation(f, 'u_time'), p.time);
    gl.uniform1f(gl.getUniformLocation(f, 'u_flash'), p.flash);
    gl.uniform1f(gl.getUniformLocation(f, 'u_fade'), p.fade);
    gl.uniform1f(gl.getUniformLocation(f, 'u_rewind'), p.rewind);
    gl.uniform2f(gl.getUniformLocation(f, 'u_res'), W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
