// Photographic Earth for the atlas globe (WebGL, three.js).
// It sits under the 2D canvas and follows the same orthographic view as d3-geo:
// centre (lng, lat) and radius R in CSS pixels. Markers, arcs and labels stay in 2D.
// Textures: NASA Blue Marble (public domain) — see public/earth/README.md.
import {
  WebGLRenderer, Scene, OrthographicCamera, SphereGeometry, Mesh, MeshPhongMaterial, ShaderMaterial,
  TextureLoader, SRGBColorSpace, DirectionalLight, AmbientLight, Color, BackSide, AdditiveBlending,
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, Group, LinearMipmapLinearFilter,
} from 'three';

export type Earth = {
  ready: boolean;
  resize(w: number, h: number, dpr: number): void;
  render(lng: number, lat: number, r: number, t: number): void;
  dispose(): void;
};

const D2R = Math.PI / 180;

export function createEarth(canvas: HTMLCanvasElement, onReady: () => void): Earth | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  camera.position.set(0, 0, 1000);

  const small = Math.min(screen.width, screen.height) < 700;
  const loader = new TextureLoader();
  let pending = 3;
  const done = () => { if (--pending === 0) { api.ready = true; onReady(); } };
  const tex = (url: string, srgb = false) => loader.load(url, (t) => {
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.minFilter = LinearMipmapLinearFilter;
    if (srgb) t.colorSpace = SRGBColorSpace;
    done();
  }, undefined, done);

  const globe = new Group();
  scene.add(globe);

  // ground
  const geo = new SphereGeometry(1, 128, 96);
  const ground = new MeshPhongMaterial({
    map: tex(small ? '/earth/day-2k.webp' : '/earth/day-4k.webp', true),
    bumpMap: tex('/earth/bump.webp'),
    bumpScale: 0.6,
    specularMap: tex('/earth/water.webp'),
    specular: new Color(0x26313d),
    shininess: 34,
  });
  globe.add(new Mesh(geo, ground));

  // clouds (alpha map), drifting slowly
  const cloudMat = new MeshPhongMaterial({ color: 0xffffff, alphaMap: loader.load('/earth/clouds.webp'), transparent: true, opacity: 0.55, depthWrite: false });
  const clouds = new Mesh(new SphereGeometry(1.006, 96, 72), cloudMat);
  globe.add(clouds);

  // atmosphere: a soft halo just outside the limb + a faint haze on the disc near the edge
  const halo = new Mesh(
    new SphereGeometry(1.035, 64, 48),
    new ShaderMaterial({
      side: BackSide, transparent: true, blending: AdditiveBlending, depthWrite: false,
      uniforms: { c: { value: new Color(0x8ab8ff) } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      // back faces of the shell: n.z ≈ -0.26 at the planet's limb → 0 at the shell's edge
      fragmentShader: `uniform vec3 c; varying vec3 vN; void main(){ float k = pow(clamp(-vN.z / 0.26, 0.0, 1.0), 3.0); gl_FragColor = vec4(c * k * 0.55, 1.0); }`,
    }),
  );
  const haze = new Mesh(
    new SphereGeometry(1.002, 96, 72),
    new ShaderMaterial({
      transparent: true, blending: AdditiveBlending, depthWrite: false,
      uniforms: { c: { value: new Color(0x6fa4ff) } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 c; varying vec3 vN; void main(){ float k = pow(1.0 - clamp(vN.z, 0.0, 1.0), 3.5); gl_FragColor = vec4(c * k * 0.5, 1.0); }`,
    }),
  );
  scene.add(halo, haze);
  const atmo = { scale: { setScalar: (r: number) => { halo.scale.setScalar(r); haze.scale.setScalar(r); } } };

  // a sparse, faint star field
  const starGeo = new BufferGeometry();
  const pts: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 700; i++) pts.push(rnd() * 2 - 1, rnd() * 2 - 1, -900);
  starGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const stars = new Points(starGeo, new PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.55 }));
  scene.add(stars);

  // light from the viewer's upper left: the visible side is day, the limb falls off softly
  const sun = new DirectionalLight(0xffffff, 2.9);
  sun.position.set(-0.55, 0.45, 1);
  scene.add(sun, new AmbientLight(0xffffff, 0.45));

  let W = 1, H = 1;
  const api: Earth = {
    ready: false,
    resize(w, h, dpr) {
      W = w; H = h;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      stars.scale.set(w / 2, h / 2, 1);
    },
    render(lng, lat, r, t) {
      // same view as d3 orthographic centred on (lng, lat): east right, north up
      globe.rotation.set(lat * D2R, -Math.PI / 2 - lng * D2R, 0);
      globe.scale.setScalar(r);
      clouds.rotation.y = t * 0.0000035;
      atmo.scale.setScalar(r);
      renderer.render(scene, camera);
    },
    dispose() { renderer.dispose(); },
  };
  return api;
}
