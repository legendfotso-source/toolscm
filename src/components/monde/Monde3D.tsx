"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The 3D set behind the homepage. Fixed to the viewport, it follows the
 * section being read (`state.current` = section index + progress, 0 → 5).
 *
 *  0  The emblem: a violet-chrome document with its folded corner (the
 *     Tools.cm mark), circled by dozens of files — PDF, Word, JPG.
 *  1  The problem: the files scatter and swell. Too heavy to send, too
 *     many to find.
 *  2  The solution: three chrome rings appear; the files stream through
 *     them and come out small and in order.
 *  3  The tools: the document steps back, data streams cross the page.
 *  4  The end: the document returns, ready.
 *
 * Reflections come from a studio environment computed on the spot
 * (RoomEnvironment): no image to download.
 */

type Props = { state: React.RefObject<number>; onFail: () => void };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function fibonacci(n: number, r: number) {
  const pts: THREE.Vector3[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = phi * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rr * r * 1.2, y * r * 1.15, Math.sin(th) * rr * r));
  }
  return pts;
}

/** The mark: a page with its top-right corner folded. */
function pageShape() {
  const w = 2.2;
  const h = 2.8;
  const f = 0.75; // fold size
  const r = 0.18;
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - f);
  s.lineTo(x + w - f, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return { s, w, h, f };
}

export default function Monde3D({ state, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 760;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail();
      return;
    }
    if (!renderer.getContext()) {
      onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);

    const disposables: Array<{ dispose: () => void }> = [];
    const d = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = d(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    camera.position.set(0, 0, 14);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(4, 6, 8);
    scene.add(key);
    const redLight = new THREE.PointLight(0xff3b5c, 0, 30, 1.5);
    redLight.position.set(-5, -2, 5);
    scene.add(redLight);
    const violetLight = new THREE.PointLight(0xa78bfa, 0, 30, 1.5);
    violetLight.position.set(6, 3, 4);
    scene.add(violetLight);

    const chromeViolet = d(new THREE.MeshPhysicalMaterial({ color: 0xb69cff, metalness: 1, roughness: 0.12, envMapIntensity: 1.3, clearcoat: 0.5 }));
    const chrome = d(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, envMapIntensity: 1.2 }));
    const lilac = d(new THREE.MeshPhysicalMaterial({ color: 0xddd6fe, metalness: 0.2, roughness: 0.2, clearcoat: 1 }));
    const deep = d(new THREE.MeshPhysicalMaterial({ color: 0x5b21b6, metalness: 0.3, roughness: 0.25, clearcoat: 1 }));
    // File types: PDF red, Word blue, JPG amber, plain white.
    const fileMats = [
      d(new THREE.MeshPhysicalMaterial({ color: 0xe5484d, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })),
      d(new THREE.MeshPhysicalMaterial({ color: 0x2f6fed, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })),
      d(new THREE.MeshPhysicalMaterial({ color: 0xf5a524, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })),
      d(new THREE.MeshPhysicalMaterial({ color: 0xf8f7ff, metalness: 0.05, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 })),
      deep,
    ];

    const world = new THREE.Group();
    scene.add(world);

    // ── The emblem: the folded page ─────────────────────────────────────
    const emblem = new THREE.Group();
    const { s: shape, w, h, f } = pageShape();
    const page = new THREE.Mesh(d(new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 8, curveSegments: 24 })), chromeViolet);
    page.geometry.translate(0, 0, -0.16);
    emblem.add(page);
    const foldShape = new THREE.Shape();
    foldShape.moveTo(w / 2 - f, h / 2);
    foldShape.lineTo(w / 2, h / 2 - f);
    foldShape.lineTo(w / 2 - f + 0.08, h / 2 - f + 0.08);
    foldShape.closePath();
    const fold = new THREE.Mesh(d(new THREE.ExtrudeGeometry(foldShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4 })), lilac);
    fold.position.z = 0.3;
    emblem.add(fold);
    const lineGeo = d(new RoundedBoxGeometry(1, 0.16, 0.08, 3, 0.06));
    [[1.3, 0.25], [1.3, -0.2], [0.8, -0.65]].forEach(([len, y]) => {
      const line = new THREE.Mesh(lineGeo, deep);
      line.scale.x = len;
      line.position.set(-0.45 + len / 2 - 0.2, y, 0.3);
      emblem.add(line);
    });
    world.add(emblem);

    // ── The rings the files pass through (solution) ─────────────────────
    const ringGeo = d(new THREE.TorusGeometry(1.25, 0.09, 24, 96));
    const rings = [-3.4, 0, 3.4].map((x) => {
      const m = new THREE.Mesh(ringGeo, chrome);
      m.position.set(x, -0.2, 0);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.001);
      world.add(m);
      return m;
    });

    // ── The files ───────────────────────────────────────────────────────
    const N = small ? 54 : 84;
    const fileGeo = d(new RoundedBoxGeometry(0.4, 0.52, 0.07, 3, 0.05));
    const shell = fibonacci(N, 2.6);
    const seed = (i: number, k: number) => {
      const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const files = shell.map((p, i) => {
      const ex = new THREE.Vector3((seed(i, 1) - 0.5) * 26, (seed(i, 2) - 0.5) * 16, (seed(i, 3) - 0.5) * 10 - 2);
      const scatter = new THREE.Vector3((seed(i, 4) - 0.5) * 17, (seed(i, 5) - 0.5) * 10, (seed(i, 6) - 0.5) * 6);
      const rot = new THREE.Euler(seed(i, 9) * 6, seed(i, 10) * 6, seed(i, 11) * 6);
      const heavy = 1.6 + seed(i, 12) * 1.4;
      const lane = seed(i, 13);
      const kind = i % 7 === 0 ? 4 : i % 4;
      return { shell: p, ex, scatter, rot, heavy, lane, kind, phase: i / N };
    });
    const byKind = [0, 1, 2, 3, 4].map((k) => files.filter((x) => x.kind === k));
    const meshes = byKind.map((list, k) => {
      const im = new THREE.InstancedMesh(fileGeo, fileMats[k], Math.max(1, list.length));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      world.add(im);
      return im;
    });

    // ── Data streams crossing the page ──────────────────────────────────
    const bitGeo = d(new RoundedBoxGeometry(0.16, 0.16, 0.16, 2, 0.04));
    const STEP = 0.3;
    type Stream = { a: THREE.InstancedMesh; b: THREE.InstancedMesh; n: number; states: THREE.Vector3[][]; phase: number };
    const makeStream = (n: number, states: THREE.Vector3[][], phase: number): Stream => {
      const a = new THREE.InstancedMesh(bitGeo, chromeViolet, Math.max(1, Math.ceil(n / 2)));
      const b = new THREE.InstancedMesh(bitGeo, lilac, Math.max(1, Math.ceil(n / 2)));
      a.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      b.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (n > 0) {
        scene.add(a);
        scene.add(b);
      }
      return { a, b, n, states, phase };
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // Text sits on the left (x < -1): streams pass right, top or bottom.
    const streams: Stream[] = [
      makeStream(small ? 70 : 110, [
        [V(-14, -6.2, -1), V(-4, -5, 1.5), V(2.6, -1, 3.2), V(6, 2.4, 2.4), V(14, 5.5, -1)],
        [V(3, -13, -1), V(4.5, -8.5, 0), V(7, -8, 1), V(10.5, -6, 0), V(16, -5, -2)],
        [V(-14, -5.5, -1), V(-3, -4.4, 1), V(3, -0.2, 2.6), V(8, 1.6, 1.5), V(14, 6, -1)],
        [V(14, -1.2, -4), V(5, -0.2, -3), V(0, -1.6, -3), V(-5, -0.4, -3), V(-14, -1.4, -4)],
        [V(3, 9.5, -1), V(2.4, 4.2, 2), V(3.6, 0, 3.4), V(6.5, -3.6, 2.2), V(12, -8, -1)],
      ], 0),
      makeStream(small ? 0 : 100, [
        [V(-14, -7.2, -2), V(-2, -6, 0), V(3.4, -2.8, 3), V(8, -0.6, 1.5), V(14, -2, -2)],
        [V(5, -13, -3), V(7, -9.5, -1), V(9, -9, -1), V(12, -7.5, -2), V(17, -6, -4)],
        [V(14, 6.5, -1), V(7.5, 3.4, 1.5), V(4, 2.8, 2), V(1.6, 4, 1), V(-1, 9, -1)],
        [V(14, -4.6, -4), V(5, -3.6, -3), V(0, -5, -3), V(-5, -3.6, -3), V(-14, -4.8, -4)],
        [V(14, 7.5, -1), V(7, 3, 2), V(3.4, 0.2, 3.2), V(1.8, -3.4, 2.2), V(0, -9, -1)],
      ], 1.7),
    ].filter((c) => c.n > 0);

    const tmp = Array.from({ length: 5 }, () => new THREE.Vector3());
    const curve = new THREE.CatmullRomCurve3(tmp, false, "centripetal");
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const m4 = new THREE.Matrix4();
    const sc = new THREE.Vector3(1, 1, 1);
    let narrowStreams = false;

    function placeStream(c: Stream, s: number, t: number) {
      const i = Math.min(3, Math.floor(s));
      const k0 = smooth(0, 1, s - i);
      const A = c.states[i];
      const B = c.states[Math.min(4, i + 1)];
      for (let k = 0; k < 5; k++) {
        tmp[k].lerpVectors(A[k], B[k], k0);
        if (!reduced) tmp[k].y += Math.sin(t * 0.7 + k * 1.3 + c.phase) * 0.25;
        if (narrowStreams) {
          tmp[k].x *= 0.55;
          tmp[k].y = tmp[k].y * 0.2 + 3.4;
        }
      }
      curve.updateArcLengths();
      const L = curve.getLength();
      const shift = ((s * 2.6 + t * (reduced ? 0 : 0.22) + c.phase) % 1) * STEP;
      let ia = 0;
      let ib = 0;
      for (let k = 0; k < c.n; k++) {
        const u = Math.min(0.999, Math.max(0, (k * STEP + shift) / L));
        curve.getPointAt(u, pos);
        q.setFromEuler(new THREE.Euler(k * 0.7 + t * 0.5, k * 0.3, 0));
        sc.setScalar(u < 0.999 ? 0.6 + 0.4 * Math.abs(Math.sin(k * 1.7)) : 0);
        m4.compose(pos, q, sc);
        if (k % 2) c.a.setMatrixAt(ia++, m4);
        else c.b.setMatrixAt(ib++, m4);
      }
      c.a.instanceMatrix.needsUpdate = true;
      c.b.instanceMatrix.needsUpdate = true;
    }

    // ── Size, pointer, visibility ───────────────────────────────────────
    let width = 1;
    let height = 1;
    const resize = () => {
      width = el.clientWidth || 1;
      height = el.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const mouse = { x: 0, y: 0, lx: 0, ly: 0 };
    const onPointer = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => document.visibilityState === "visible" && start();
    document.addEventListener("visibilitychange", onVisibility);

    let s = state.current ?? 0;
    const clock = new THREE.Clock();
    const o = new THREE.Object3D();
    const v = new THREE.Vector3();
    const counters = [0, 0, 0, 0, 0];

    function frame() {
      raf = 0;
      if (document.visibilityState !== "visible") return;
      const t = clock.getElapsedTime();
      const m = reduced ? 0 : 1;
      s += ((state.current ?? 0) - s) * (reduced ? 1 : 0.08);
      mouse.lx += (mouse.x - mouse.lx) * 0.05;
      mouse.ly += (mouse.y - mouse.ly) * 0.05;
      const narrow = width / height < 0.9;
      const arrive = reduced ? 1 : smooth(0.2, 2.6, t);

      const targets = narrow
        ? [
            { x: 0, y: 2.8, z: 0, e: 0.46 },
            { x: 0, y: 2.9, z: -3, e: 0.44 },
            { x: 0, y: 3.0, z: 0, e: 0.4 },
            { x: 0.4, y: 3.1, z: -4, e: 0.32 },
            { x: 0, y: 2.8, z: 0, e: 0.46 },
          ]
        : [
            { x: 3.3, y: 0.1, z: 0, e: 0.92 },
            { x: 3.4, y: 0.4, z: -3, e: 0.75 },
            { x: 3.4, y: 0, z: 0, e: 0.8 },
            { x: 5.0, y: 2.8, z: -4, e: 0.45 },
            { x: 3.4, y: 0.1, z: 0, e: 0.92 },
          ];
      const i0 = Math.min(3, Math.floor(s));
      const k0 = smooth(0, 1, s - i0);
      const A = targets[i0];
      const B = targets[Math.min(4, i0 + 1)];
      world.position.set(mix(A.x, B.x, k0), mix(A.y, B.y, k0), mix(A.z, B.z, k0));
      world.scale.setScalar(mix(A.e, B.e, k0));
      world.rotation.set(mouse.ly * 0.15, mouse.lx * 0.25, 0);

      const scatter = smooth(0.75, 1.35, s) * (1 - smooth(1.75, 2.3, s));
      const swell = smooth(1.0, 1.45, s) * (1 - smooth(1.8, 2.2, s));
      const flow = smooth(1.85, 2.35, s) * (1 - smooth(3.2, 3.8, s));

      emblem.rotation.set(Math.sin(t * 0.4) * 0.1 * m, -0.35 + Math.sin(t * 0.3) * 0.3 * m + s * 0.6, Math.sin(t * 0.5) * 0.04 * m);
      emblem.scale.setScalar(1 - flow * 0.45);
      emblem.position.y = flow * 1.9;
      chromeViolet.roughness = 0.12 + swell * 0.3;
      rings.forEach((r, k) => {
        r.scale.setScalar(Math.max(0.001, flow * (1 - k * 0.12)));
        r.rotation.x = t * 0.4 * m + k;
      });

      counters.fill(0);
      byKind.forEach((list, k) => {
        list.forEach((fi, j) => {
          v.copy(fi.ex).lerp(fi.shell, arrive);
          if (scatter > 0) v.lerp(fi.scatter, scatter);
          const ang = t * 0.12 * m + s * 0.5;
          let x = v.x * Math.cos(ang) - v.z * Math.sin(ang);
          let z = v.x * Math.sin(ang) + v.z * Math.cos(ang);
          let y = v.y;
          let size = 1 + swell * (fi.heavy - 1);
          if (flow > 0) {
            // Through the rings, left to right, shrinking at each one.
            const u = (fi.phase + t * 0.07 * m + s * 0.3) % 1;
            const px = -6 + u * 12;
            const a = fi.lane * Math.PI * 2 + u * 6;
            const rad = 0.75 * (1 - u * 0.4);
            x = mix(x, px, flow);
            y = mix(y, -0.2 + Math.sin(a) * rad, flow);
            z = mix(z, Math.cos(a) * rad, flow);
            const shrink = 1.3 - 0.75 * smooth(-3.6, 3.6, px);
            size = mix(size, shrink, flow);
          }
          o.position.set(x, y, z);
          const disorder = 1 - arrive + scatter;
          o.rotation.set(fi.rot.x * disorder + t * 0.2 * disorder, fi.rot.y * disorder + flow * 1.57, fi.rot.z * disorder);
          if (disorder < 0.5 && flow < 0.5) o.lookAt(o.position.clone().multiplyScalar(2));
          o.scale.setScalar(size);
          o.updateMatrix();
          meshes[k].setMatrixAt(counters[k]++, o.matrix);
          void j;
        });
        meshes[k].instanceMatrix.needsUpdate = true;
      });

      narrowStreams = narrow;
      streams.forEach((c) => placeStream(c, s, t));

      redLight.intensity = 40 * swell;
      violetLight.intensity = 34 * flow + 20 * smooth(3.6, 4.2, s);
      key.intensity = 1.2 - 0.5 * smooth(0.6, 1.2, s);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    start();

    const lost = (e: Event) => {
      e.preventDefault();
      onFail();
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);

    return () => {
      cancelAnimationFrame(raf);
      raf = -1;
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      meshes.forEach((im) => im.dispose());
      streams.forEach((c) => {
        c.a.dispose();
        c.b.dispose();
      });
      disposables.forEach((x) => x.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full w-full" />;
}
