"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The 3D set behind the homepage, fixed to the viewport and driven by the
 * section being read (`state.current` = section index + progress, 0 → 5).
 *
 * Unlike a static emblem with things orbiting it, this one is a small film
 * about paper. Real pages — PDF, Word, photo — that bend as they move, and a
 * camera that travels with them:
 *
 *  0  A spiral of pages turning slowly, like a rolodex of your documents.
 *  1  The problem: the pages blow apart, crumple and swell. Too heavy, too
 *     many, in the wrong order.
 *  2  The solution: a sheet of glass with a violet scan line. As you scroll,
 *     the pages fall through it one by one and come out flat, small and
 *     stacked.
 *  3  The tools: the stack settles, a single glass document is lifted from it.
 *  4  The end: that one clean file, upright, ready to send.
 *
 * Page bending is done on the CPU — a few hundred vertices — so it works the
 * same on every GPU. Reflections come from a studio environment computed on
 * the spot: no image to download.
 */

type Props = { state: React.RefObject<number>; onFail: () => void };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const seedOf = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const PW = 1.6;
const PH = 2.26;

/** A page drawn on a canvas: header band, a badge, lines of text or a photo. */
function pageTexture(kind: number, renderer: THREE.WebGLRenderer) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 452;
  const g = c.getContext("2d")!;
  const colours = ["#e5484d", "#2f6fed", "#f5a524", "#7c3aed"];
  const labels = ["PDF", "DOC", "JPG", "PDF"];
  g.fillStyle = "#fbfaff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = colours[kind];
  g.fillRect(0, 0, c.width, 14);
  // Badge
  g.beginPath();
  g.roundRect(24, 36, 74, 34, 8);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "bold 20px system-ui, sans-serif";
  g.fillText(labels[kind], 36, 60);
  if (kind === 2) {
    // A photo: sky, sun, hills.
    const grd = g.createLinearGradient(0, 96, 0, 300);
    grd.addColorStop(0, "#c4b5fd");
    grd.addColorStop(1, "#fde68a");
    g.fillStyle = grd;
    g.fillRect(24, 96, 272, 220);
    g.fillStyle = "#fff7";
    g.beginPath();
    g.arc(220, 150, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#6d28d9";
    g.beginPath();
    g.moveTo(24, 316);
    g.lineTo(110, 220);
    g.lineTo(170, 270);
    g.lineTo(230, 200);
    g.lineTo(296, 316);
    g.fill();
  } else {
    g.fillStyle = "#1e1240";
    g.fillRect(24, 100, 200, 16);
  }
  g.fillStyle = "#d4d0e4";
  const top = kind === 2 ? 340 : 140;
  for (let y = top; y < 430; y += 20) {
    const w = 272 * (0.55 + 0.45 * Math.abs(Math.sin(y * 1.7)));
    g.fillRect(24, y, w, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
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

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const look = new THREE.Vector3();

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 7, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa78bfa, 1.2);
    rim.position.set(-6, 2, -4);
    scene.add(rim);
    const redLight = new THREE.PointLight(0xff3b5c, 0, 30, 1.4);
    redLight.position.set(-3, 1, 4);
    scene.add(redLight);
    const scanLight = new THREE.PointLight(0x8b5cf6, 0, 12, 1.2);
    scene.add(scanLight);

    const world = new THREE.Group();
    scene.add(world);

    // ── The pages ───────────────────────────────────────────────────────
    const N = small ? 18 : 30;
    const SEG = 18;
    const kinds = [0, 1, 2, 3].map((k) =>
      d(
        new THREE.MeshPhysicalMaterial({
          map: d(pageTexture(k, renderer)),
          roughness: 0.38,
          clearcoat: 0.55,
          clearcoatRoughness: 0.25,
          side: THREE.DoubleSide,
        }),
      ),
    );
    type Page = {
      mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
      base: Float32Array;
      chaos: THREE.Vector3;
      spin: THREE.Euler;
      swell: number;
      jitter: number;
    };
    const pages: Page[] = [];
    for (let i = 0; i < N; i++) {
      const geo = d(new THREE.PlaneGeometry(PW, PH, 1, SEG));
      const mesh = new THREE.Mesh(geo, kinds[i % 7 === 3 ? 2 : i % 4 === 1 ? 1 : i % 5 === 2 ? 3 : 0]);
      world.add(mesh);
      pages.push({
        mesh,
        base: Float32Array.from(geo.attributes.position.array as Float32Array),
        chaos: new THREE.Vector3(0.4 + (seedOf(i, 1) - 0.5) * 7.5, (seedOf(i, 2) - 0.5) * 5.6, -1 + (seedOf(i, 3) - 0.6) * 5),
        spin: new THREE.Euler(seedOf(i, 4) * 6, seedOf(i, 5) * 6, seedOf(i, 6) * 6),
        swell: 1.05 + seedOf(i, 7) * 0.45,
        jitter: (seedOf(i, 8) - 0.5) * 2.4,
      });
    }

    /** Bend a page: `curl` rolls it up along its height (radians), `twist` across it. */
    function bend(p: Page, curl: number, twist: number) {
      const pos = p.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      const c = Math.abs(curl) < 0.002 ? 0.002 * Math.sign(curl || 1) : curl;
      const R = PH / c;
      for (let k = 0; k < pos.count; k++) {
        const x = p.base[k * 3];
        const y = p.base[k * 3 + 1];
        const u = y / PH + 0.5; // 0 at the bottom edge, 1 at the top
        const ang = c * u;
        a[k * 3] = x;
        a[k * 3 + 1] = -PH / 2 + R * Math.sin(ang);
        a[k * 3 + 2] = R * (1 - Math.cos(ang)) + twist * x * (u - 0.5) * 1.4;
      }
      pos.needsUpdate = true;
      p.mesh.geometry.computeVertexNormals();
    }

    // ── The glass scanner ───────────────────────────────────────────────
    const scanner = new THREE.Group();
    const glass = new THREE.Mesh(
      d(new RoundedBoxGeometry(4.6, 0.12, 3.4, 4, 0.06)),
      d(
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.04,
          transmission: small ? 0 : 1,
          transparent: small,
          opacity: small ? 0.35 : 1,
          thickness: 0.6,
          ior: 1.45,
          envMapIntensity: 1.4,
          attenuationColor: new THREE.Color(0xc4b5fd),
          attenuationDistance: 2.5,
        }),
      ),
    );
    scanner.add(glass);
    const beamMat = d(new THREE.MeshBasicMaterial({ color: 0xa78bfa, toneMapped: false }));
    const beam = new THREE.Mesh(d(new THREE.BoxGeometry(4.7, 0.025, 0.04)), beamMat);
    beam.position.y = 0.075;
    scanner.add(beam);
    const frameMat = d(new THREE.MeshPhysicalMaterial({ color: 0xd8ccff, metalness: 1, roughness: 0.15 }));
    [-1.73, 1.73].forEach((z) => {
      const bar = new THREE.Mesh(d(new RoundedBoxGeometry(4.75, 0.16, 0.08, 2, 0.03)), frameMat);
      bar.position.z = z;
      scanner.add(bar);
    });
    scanner.scale.setScalar(0.001);
    world.add(scanner);

    // ── The final file: one glass document ─────────────────────────────
    const finalDoc = new THREE.Group();
    const docShape = new THREE.Shape();
    const fw = PW * 1.05;
    const fh = PH * 1.05;
    const fold = 0.45;
    docShape.moveTo(-fw / 2, -fh / 2);
    docShape.lineTo(fw / 2, -fh / 2);
    docShape.lineTo(fw / 2, fh / 2 - fold);
    docShape.lineTo(fw / 2 - fold, fh / 2);
    docShape.lineTo(-fw / 2, fh / 2);
    docShape.closePath();
    const docGeo = d(new THREE.ExtrudeGeometry(docShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 6 }));
    docGeo.center();
    const docMat = d(
      new THREE.MeshPhysicalMaterial({
        color: 0xb69cff,
        metalness: 0.2,
        roughness: 0.08,
        transmission: 0,
        thickness: 0.4,
        ior: 1.5,
        clearcoat: 1,
        envMapIntensity: 1.5,
        attenuationColor: new THREE.Color(0x6d28d9),
        attenuationDistance: 0.9,
      }),
    );
    finalDoc.add(new THREE.Mesh(docGeo, docMat));
    const tickMat = d(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.15, emissive: 0x6d28d9, emissiveIntensity: 0.2 }));
    const tickCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.38, 0, 0), new THREE.Vector3(-0.1, -0.28, 0), new THREE.Vector3(0.42, 0.32, 0)], false, "catmullrom", 0.1);
    const tick = new THREE.Mesh(d(new THREE.TubeGeometry(tickCurve, 40, 0.07, 12, false)), tickMat);
    tick.position.z = 0.16;
    finalDoc.add(tick);
    finalDoc.scale.setScalar(0.001);
    world.add(finalDoc);

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

    // Camera path: one shot per section.
    const shots = [
      { p: [0, 2.6, 10.2], l: [0, -0.1, 0] },
      { p: [-1.5, 1.2, 14], l: [0, 0, 0] },
      { p: [0, 5.2, 9.5], l: [0, -0.4, 0] },
      { p: [2.5, 2.4, 11], l: [0, -0.6, 0] },
      { p: [0, 0.4, 9], l: [0, 0, 0] },
    ];

    let s = state.current ?? 0;
    const clock = new THREE.Clock();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    function frame() {
      raf = 0;
      if (document.visibilityState !== "visible") return;
      const t = clock.getElapsedTime();
      const m = reduced ? 0 : 1;
      s += ((state.current ?? 0) - s) * (reduced ? 1 : 0.08);
      mouse.lx += (mouse.x - mouse.lx) * 0.05;
      mouse.ly += (mouse.y - mouse.ly) * 0.05;
      const narrow = width / height < 0.9;
      const arrive = reduced ? 1 : smooth(0.1, 2.2, t);

      // Camera
      const i0 = Math.min(3, Math.floor(s));
      const k0 = smooth(0, 1, s - i0);
      const A = shots[i0];
      const B = shots[Math.min(4, i0 + 1)];
      const zoomOut = narrow ? 1.55 : 1;
      camera.position.set(
        mix(A.p[0], B.p[0], k0) + mouse.lx * 0.6,
        mix(A.p[1], B.p[1], k0) - mouse.ly * 0.4,
        mix(A.p[2], B.p[2], k0) * zoomOut,
      );
      look.set(mix(A.l[0], B.l[0], k0), mix(A.l[1], B.l[1], k0), mix(A.l[2], B.l[2], k0));
      camera.lookAt(look);
      // The scene sits to the right of the text on desktop, above it on phones.
      if (narrow) camera.setViewOffset(width, height, 0, height * 0.3, width, height);
      else camera.setViewOffset(width, height, -width * 0.2, 0, width, height);

      const chaos = smooth(0.7, 1.3, s) * (1 - smooth(1.6, 2.05, s));
      const scan = smooth(1.75, 2.05, s) * (1 - smooth(3.3, 3.8, s));
      const flowP = Math.min(1, Math.max(0, (s - 2) / 0.95)); // progress through the solution section
      const settle = smooth(2.85, 3.4, s);
      const finale = smooth(3.55, 4.25, s);

      scanner.scale.setScalar(Math.max(0.001, scan * 0.78));
      scanner.position.y = 0.1;
      beamMat.color.setHSL(0.74, 0.9, 0.62 + 0.12 * Math.sin(t * 4) * m);
      scanLight.intensity = 22 * scan;
      redLight.intensity = 36 * chaos;
      key.intensity = 1.6 - 0.4 * chaos;

      pages.forEach((p, i) => {
        // 0 · spiral
        const a = i * (small ? 0.62 : 0.42) + t * 0.18 * m + s * 0.8;
        const spiralY = (i - N / 2) * (small ? 0.09 : 0.065);
        let x = Math.cos(a) * 1.55;
        let y = spiralY;
        let z = Math.sin(a) * 1.55;
        e.set(0, -a + Math.PI / 2, 0);
        // fly-in at load
        if (arrive < 1) {
          x = mix(p.chaos.x * 2.2, x, arrive);
          y = mix(p.chaos.y * 2.2, y, arrive);
          z = mix(p.chaos.z * 2 - 6, z, arrive);
        }
        let curl = 0.12 + 0.05 * Math.sin(t + i) * m;
        let twist = 0;
        let size = 1;

        // 1 · chaos
        if (chaos > 0) {
          x = mix(x, p.chaos.x, chaos);
          y = mix(y, p.chaos.y, chaos);
          z = mix(z, p.chaos.z, chaos);
          e.set(mix(e.x, p.spin.x + t * 0.3 * m, chaos), mix(e.y, p.spin.y + t * 0.2 * m, chaos), mix(e.z, p.spin.z, chaos));
          curl = mix(curl, 0.9 * Math.sin(i * 1.3 + t * 0.8 * m), chaos);
          twist = mix(0, Math.sin(i * 2.1 + t * m) * 0.6, chaos);
          size = mix(1, p.swell, chaos);
        }

        // 2 · fall through the scanner into a neat stack
        if (scan > 0) {
          const own = i / N;
          const through = Math.min(1, Math.max(0, (flowP - own * 0.85) / 0.18));
          const queueX = p.jitter * 0.7;
          const queueY = 2.6 + (own - flowP) * 3;
          const stackY = -1.55 + i * 0.035 * (1 - settle * 0.4);
          const fall = smooth(0, 1, through);
          // above: hovering in a loose queue; below: flat in the stack
          const ax = mix(queueX, 0, fall);
          const ay = mix(Math.max(queueY, 1.1), stackY, fall);
          const az = mix(-0.6 + (own - 0.5) * 1.2, 0, fall);
          x = mix(x, ax, scan);
          y = mix(y, ay, scan);
          z = mix(z, az, scan);
          const flatX = -Math.PI / 2;
          e.set(mix(e.x, mix(-0.25, flatX, fall), scan), mix(e.y, mix(p.jitter * 0.3, 0, fall), scan), mix(e.z, mix(p.jitter * 0.2, 0, fall), scan));
          curl = mix(curl, mix(0.35, 0, fall), scan);
          twist = mix(twist, 0, scan);
          size = mix(size, mix(0.82, 0.55, fall), scan);
        }

        // 4 · the stack recedes behind the final file
        if (finale > 0) {
          y = mix(y, -1.9 + i * 0.02, finale);
          z = mix(z, -1.2, finale);
          size = mix(size, 0.55, finale);
        }

        p.mesh.position.set(x, y, z);
        q.setFromEuler(e);
        p.mesh.quaternion.copy(q);
        p.mesh.scale.setScalar(size);
        bend(p, curl, twist);
      });

      // 3–4 · one clean glass document rises from the stack
      const lift = smooth(2.9, 3.5, s);
      finalDoc.scale.setScalar(Math.max(0.001, lift * (narrow ? 0.8 : 1)));
      finalDoc.position.set(0, mix(-1.2, 0.3, lift) + Math.sin(t * 0.9) * 0.06 * m, mix(0, 0.6, finale));
      finalDoc.rotation.set(mix(-1.2, 0, lift), Math.sin(t * 0.5) * 0.35 * m + (1 - finale) * 0.5, 0);

      world.rotation.y = mouse.lx * 0.08;
      world.scale.setScalar(narrow ? 0.78 - 0.12 * scan : 0.82);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    start();

    const lost = (ev: Event) => {
      ev.preventDefault();
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
      disposables.forEach((x) => x.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full w-full" />;
}
