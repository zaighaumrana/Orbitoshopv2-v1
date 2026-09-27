// GhostFibers shader from React Bits (https://reactbits.dev/r/GhostFibers-JS-CSS.json).
// Vanilla WebGL2 port; shader retained from the approved prototype registry source.
const vertex = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uLayers;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uLayerSpeed;
uniform float uTwist;
uniform float uTwistFrequency;
uniform float uTwistSpeed;
uniform float uLineFrequency;
uniform float uLineSpacing;
uniform float uLineSharpness;
uniform float uGlowFalloff;
uniform float uGlowIntensity;
uniform float uBrightness;
uniform float uBlueBoost;
uniform float uVignette;
uniform float uGrain;
uniform float uRotationSpeed;
uniform float uLightMode;
uniform vec3 uLineColor;
uniform vec3 uGlowColor;

out vec4 fragColor;

#define MAX_LAYERS 10

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

float grainHash(vec2 point) {
  point = floor(point);
  float hash = 52.9829189 * fract(dot(point, vec2(0.065, 0.005)));
  return fract(hash);
}

float layeredGrain(vec2 fragmentPixel) {
  vec2 point = mod(fragmentPixel + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
  vec2 rotated = mat2(0.8, -0.5, 0.5, 0.8) * point;
  float grain = 0.0;
  grain += 0.40 * grainHash(rotated);
  grain += 0.25 * grainHash(rotated * 2.0 + 17.0);
  grain += 0.20 * grainHash(rotated * 4.0 + 47.0);
  grain += 0.10 * grainHash(rotated * 8.0 + 113.0);
  grain += 0.05 * grainHash(rotated * 16.0 + 191.0);
  return grain;
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
  float time = uTime * uSpeed;
  vec3 backdrop = mix(vec3(0.070588, 0.058824, 0.090196), vec3(1.0), step(0.5, uLightMode));
  vec3 centerTone = max(uLineColor * 0.85567 - uGlowColor * 0.06186, vec3(0.0));
  vec3 cloudTone = uLineColor * 0.19588 + uGlowColor * 0.2268;
  vec2 p = uv;
  p /= max(uScale, 0.05);
  p = rotate2d(radians(uRotation) + time * uRotationSpeed) * p;
  vec3 color = vec3(0.0);
  float fiberField = 0.0;

  for (int index = 0; index < MAX_LAYERS; index++) {
    float fi = float(index) + 1.0;
    if (fi > uLayers) break;

    p += uWaveAmplitude * sin(p.yx * fi * uWaveFrequency + time * (uWaveSpeed + fi * uLayerSpeed));

    float radius = length(p);
    float polarAngle = atan(p.y, p.x);
    polarAngle += sin(radius * uTwistFrequency - time * uTwistSpeed + fi) * uTwist;
    p = vec2(cos(polarAngle), sin(polarAngle)) * radius;

    float lines = abs(sin(p.x * (uLineFrequency + fi * uLineSpacing) + sin(p.y * 3.0 + time)));
    lines = pow(max(0.0, 1.0 - lines), uLineSharpness);
    fiberField += lines / fi;
    color += uLineColor * lines / fi;

    float glow = exp(-uGlowFalloff * abs(sin(p.x * 3.0 + time + fi)));
    color += uGlowColor * glow * uGlowIntensity / (fi * 2.0);
  }

  float center = exp(-2.2 * dot(uv, uv));
  color += centerTone * center;

  float cloud = exp(-1.5 * length(uv + vec2(sin(time * 0.3) * 0.25, cos(time * 0.25) * 0.18)));
  color += cloudTone * cloud;

  float vignette = 1.0 - smoothstep(0.35, 1.45, length(uv));
  color *= mix(1.0 - uVignette, 1.0, vignette);
  color = 1.0 - exp(-color * uBrightness);
  color.b *= uBlueBoost;

  vec3 outputColor;
  if (uLightMode > 0.5) {
    float edgeFade = mix(1.0 - uVignette, 1.0, vignette);
    float fibers = pow(smoothstep(0.12, 1.05, fiberField) * edgeFade, 1.5);
    float atmosphere = (center * 0.025 + cloud * 0.015) * edgeFade;
    vec3 fiberInk = mix(backdrop, uLineColor, 0.52);
    vec3 airColor = mix(backdrop, uGlowColor, 0.16);

    outputColor = mix(backdrop, airColor, atmosphere);
    outputColor = mix(outputColor, fiberInk, fibers * 0.3);
  } else {
    outputColor = backdrop + color;
  }

  float noise = (layeredGrain(gl_FragCoord.xy) - 0.5) * uGrain;
  outputColor = clamp(outputColor + noise, 0.0, 1.0);
  fragColor = vec4(outputColor, 1.0);
}
`;


const fixedUniforms = {
  uSpeed:0.2, uScale:2, uRotation:0, uRotationSpeed:0.25, uLayers:4,
  uWaveAmplitude:0.015, uWaveFrequency:3, uWaveSpeed:0.15, uLayerSpeed:0.08,
  uTwist:0.1, uTwistFrequency:5, uTwistSpeed:1.2, uLineFrequency:5,
  uLineSpacing:2, uLineSharpness:16, uGlowFalloff:10, uGlowIntensity:1.6,
  uBrightness:2, uBlueBoost:1.25, uVignette:0.8, uGrain:0.05, uLightMode:0,
}

// Progressive enhancement: no graphics failure may prevent authentication.
export function mountGhostFibers(container) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (motion.matches || !container.isConnected) return () => {}
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  let gl, program, buffer, vao, frame = 0, timer = 0, stopped = false
  const shaders = []
  let elapsed = 0, previous = performance.now()
  const cleanup = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', visibility)
    motion.removeEventListener('change', motionChange)
    canvas.removeEventListener('webglcontextlost', contextLost)
    container.classList.remove('is-ready')
    canvas.remove()
    if (gl) {
      if (buffer) gl.deleteBuffer(buffer)
      if (vao) gl.deleteVertexArray(vao)
      if (program) gl.deleteProgram(program)
      shaders.forEach(shader => gl.deleteShader(shader))
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
  let timeLocation, resolutionLocation
  const draw = () => {
    gl.uniform1f(timeLocation, elapsed)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  function resize() {
    // Fixed DPR=1, matching the approved configuration.
    canvas.width = Math.max(1, Math.floor(container.clientWidth))
    canvas.height = Math.max(1, Math.floor(container.clientHeight))
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    draw()
  }
  function loop(now) {
    frame = 0
    if (!container.isConnected) { cleanup(); return }
    if (stopped || document.hidden) return
    elapsed += Math.min((now - previous) / 1000, 0.1)
    previous = now
    draw()
    frame = requestAnimationFrame(loop)
  }
  function visibility() {
    cancelAnimationFrame(frame)
    frame = 0
    if (!stopped && !document.hidden) {
      previous = performance.now()
      frame = requestAnimationFrame(loop)
    }
  }
  function motionChange() { if (motion.matches) cleanup() }
  function contextLost(event) { event.preventDefault(); cleanup() }
  try {
    gl = canvas.getContext('webgl2', {alpha:false, antialias:false})
    if (!gl) return cleanup
    const compile = (type, source) => {
      const shader = gl.createShader(type)
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('GhostFibers shader unavailable')
      return shader
    }
    program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GhostFibers program unavailable')
    gl.useProgram(program)
    vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    for (const [key,value] of Object.entries(fixedUniforms)) gl.uniform1f(gl.getUniformLocation(program,key),value)
    gl.uniform3f(gl.getUniformLocation(program,'uLineColor'),20/255,14/255,53/255)
    gl.uniform3f(gl.getUniformLocation(program,'uGlowColor'),52/255,55/255,160/255)
    timeLocation = gl.getUniformLocation(program,'uTime')
    resolutionLocation = gl.getUniformLocation(program,'uResolution')
    resize()
    container.appendChild(canvas)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    motion.addEventListener('change', motionChange)
    canvas.addEventListener('webglcontextlost', contextLost)
    timer = setTimeout(() => {
      if (!stopped && container.isConnected) container.classList.add('is-ready')
    }, 250)
    visibility()
  } catch {
    cleanup()
  }
  return cleanup
}
